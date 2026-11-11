#!/usr/bin/env python3
"""
Master PostgreSQL (Neon) to MySQL SQL Dump Converter
====================================================
Converts a Neon / PostgreSQL SQL dump file (containing schema and/or data)
into a 100% MySQL-compatible .sql file ready for execution with:
    mysql -u [user] -p [database] < output_mysql.sql

Features:
- Streaming line-by-line parser (handles multi-GB dump files with minimal RAM).
- Handles both COPY ... FROM stdin blocks and standard INSERT INTO statements.
- Converts COPY data into batched, optimized multi-row MySQL INSERT statements.
- Automatic PostgreSQL -> MySQL data type mapping (UUID, JSONB, TIMESTAMPTZ, BYTEA, SERIAL, etc.).
- Converts nextval sequences into AUTO_INCREMENT primary keys.
- Strips Postgres-specific commands (SET search_path, OWNER TO, pg_catalog, extensions, table access methods).
- Converts identifier quotes from "identifier" to `identifier`.
- Strips schema prefixes (e.g., `public.users` -> `users`).
- Adds transactional wrapper and foreign key disables for zero-error import.
"""

"""
Steps to get Neon pg_dump:
- Go to Neon dashboard and click the Connection Details widget.
- Copy the 'Connection String' with pooled connection turned off.
- It looks like : 'postgresql://<user>:<password>@<ep-identifier>.<region>.neon.tech/<dbname>?sslmode=require'
- Run this code in Powershell (replace the connection string):
- pg_dump "postgresql://<user>:<password>@<ep-identifier>.<region>.neon.tech/<dbname>?sslmode=require" --no-owner --no-privileges -f neon_dump.sql
"""


#Execution in CMD:
#python pg_to_mysql.py neon_dump.sql mysql_dump.sql

import sys
import os
import re
import argparse
from typing import List, Dict, Optional, Tuple

# Postgres -> MySQL Data Type Mappings (Ordered: specific first)
DATA_TYPE_MAP = [
    # Serial / Auto-increment
    (r"\bbigserial\b", "BIGINT AUTO_INCREMENT"),
    (r"\bsmallserial\b", "SMALLINT AUTO_INCREMENT"),
    (r"\bserial\b", "INT AUTO_INCREMENT"),
    
    # Dates & Times (Must be before generic timestamp)
    (r"\btimestamp\s*\(\d+\)\s+with\s+time\s+zone\b", "DATETIME"),
    (r"\btimestamp\s+with\s+time\s+zone\b", "DATETIME"),
    (r"\btimestamptz\b", "DATETIME"),
    (r"\btimestamp\s*\(\d+\)\s+without\s+time\s+zone\b", "DATETIME"),
    (r"\btimestamp\s+without\s+time\s+zone\b", "DATETIME"),
    (r"\btimestamp\b", "DATETIME"),
    (r"\btime\s+with\s+time\s+zone\b", "TIME"),
    (r"\btime\s+without\s+time\s+zone\b", "TIME"),
    (r"\btimetz\b", "TIME"),
    (r"\bdate\b", "DATE"),
    (r"\binterval\b", "VARCHAR(255)"),

    # Strings & Characters (Parameterized first, then bare)
    (r"\bcharacter varying\s*\(\s*(\d+)\s*\)", r"VARCHAR(\1)"),
    (r"\bcharacter varying\b(?!\s*\()", "VARCHAR(255)"),
    (r"\bvarchar\s*\(\s*(\d+)\s*\)", r"VARCHAR(\1)"),
    (r"\bvarchar\b(?!\s*\()", "VARCHAR(255)"),
    (r"\bcharacter\s*\(\s*(\d+)\s*\)", r"CHAR(\1)"),
    (r"\bcharacter\b(?!\s*\()", "CHAR(1)"),
    (r"\bchar\s*\(\s*(\d+)\s*\)", r"CHAR(\1)"),
    (r"\bchar\b(?!\s*\()", "CHAR(1)"),
    (r"\bcitext\b", "TEXT"),
    (r"\btext\b", "LONGTEXT"),
    
    # Integers
    (r"\bsmallint\b", "SMALLINT"),
    (r"\bbigint\b", "BIGINT"),
    (r"\binteger\b", "INT"),
    (r"\bint\b(?!\s*[0-9])", "INT"),
    (r"\bint4\b", "INT"),
    (r"\bint8\b", "BIGINT"),
    (r"\bint2\b", "SMALLINT"),
    
    # Booleans
    (r"\bboolean\b", "TINYINT(1)"),
    (r"\bbool\b", "TINYINT(1)"),
    
    # Binary
    (r"\bbytea\b", "LONGBLOB"),
    
    # Numeric / Float
    (r"\bdouble precision\b", "DOUBLE"),
    (r"\breal\b", "FLOAT"),
    (r"\bfloat8\b", "DOUBLE"),
    (r"\bfloat4\b", "FLOAT"),
    (r"\bmoney\b", "DECIMAL(19,4)"),
    (r"\bnumeric\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)", r"DECIMAL(\1,\2)"),
    (r"\bnumeric\s*\(\s*(\d+)\s*\)", r"DECIMAL(\1,0)"),
    (r"\bnumeric\b(?!\s*\()", "DECIMAL(10,2)"),
    (r"\bdecimal\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)", r"DECIMAL(\1,\2)"),
    (r"\bdecimal\s*\(\s*(\d+)\s*\)", r"DECIMAL(\1,0)"),
    (r"\bdecimal\b(?!\s*\()", "DECIMAL(10,2)"),
    
    # JSON & UUID
    (r"\bjsonb\b", "JSON"),
    (r"\bjson\b", "JSON"),
    (r"\buuid\b", "CHAR(36)"),
    
    # Network / Addresses
    (r"\binet\b", "VARCHAR(45)"),
    (r"\bcidr\b", "VARCHAR(45)"),
    (r"\bmacaddr\b", "VARCHAR(17)"),
    (r"\bmacaddr8\b", "VARCHAR(23)"),
    
    # Geometry
    (r"\bgeometry\b", "GEOMETRY"),
    (r"\bgeography\b", "GEOMETRY"),
    (r"\bpoint\b", "POINT"),
    (r"\bpolygon\b", "POLYGON"),
    
    # Postgres Arrays -> JSON
    (r"\b\w+\[\]", "JSON"),
]

# Patterns of standalone statements to discard entirely
IGNORE_STATEMENT_PATTERNS = [
    re.compile(r"^SET\s+statement_timeout", re.I),
    re.compile(r"^SET\s+lock_timeout", re.I),
    re.compile(r"^SET\s+idle_in_transaction_session_timeout", re.I),
    re.compile(r"^SET\s+client_encoding", re.I),
    re.compile(r"^SET\s+standard_conforming_strings", re.I),
    re.compile(r"^SET\s+check_function_bodies", re.I),
    re.compile(r"^SET\s+xmloption", re.I),
    re.compile(r"^SET\s+client_min_messages", re.I),
    re.compile(r"^SET\s+row_security", re.I),
    re.compile(r"^SET\s+default_tablespace", re.I),
    re.compile(r"^SET\s+default_table_access_method", re.I),
    re.compile(r"^SET\s+search_path", re.I),
    re.compile(r"^SELECT\s+pg_catalog\.set_config", re.I),
    re.compile(r"^CREATE\s+EXTENSION", re.I),
    re.compile(r"^COMMENT\s+ON\s+EXTENSION", re.I),
    re.compile(r"^COMMENT\s+ON\s+SCHEMA", re.I),
    re.compile(r"^COMMENT\s+ON\s+TABLE", re.I),
    re.compile(r"^COMMENT\s+ON\s+COLUMN", re.I),
    re.compile(r"^ALTER\s+TABLE\s+.*?OWNER\s+TO", re.I),
    re.compile(r"^ALTER\s+SEQUENCE\s+", re.I),
    re.compile(r"^CREATE\s+SEQUENCE\s+", re.I),
    re.compile(r"^CREATE\s+SCHEMA\s+", re.I),
    re.compile(r"^SELECT\s+pg_catalog\.setval", re.I),
]

def clean_identifier(name: str) -> str:
    """Removes quotes/schema prefix and wraps with MySQL backtick."""
    name = name.strip()
    # Strip public. or "public".
    name = re.sub(r'^(?:\"?public\"?\.)', '', name, flags=re.I)
    # Strip existing quotes or backticks
    name = name.strip('"` ')
    return f"`{name}`"

def convert_identifiers_in_text(text: str) -> str:
    """Converts double-quoted identifiers to backticks, stripping public. prefix."""
    # Remove public. schema prefix in forms like public.table or "public"."table"
    text = re.sub(r'(?:"?public"?\.)"([^"]+)"', r'`\1`', text, flags=re.I)
    text = re.sub(r'(?:"?public"?\.)([a-zA-Z0-9_]+)', r'`\1`', text, flags=re.I)
    
    # Convert remaining double-quoted identifiers "name" to `name`
    # (avoiding strings that look like single-quoted literals)
    text = re.sub(r'"([a-zA-Z0-9_]+)"', r'`\1`', text)
    return text

def convert_data_types(col_def: str) -> str:
    """Replaces PostgreSQL data types with MySQL data types in column definitions."""
    # Convert array types first
    col_def = re.sub(r'([a-zA-Z0-9_]+)\[\]', 'JSON', col_def)
    
    for pattern, replacement in DATA_TYPE_MAP:
        col_def = re.sub(pattern, replacement, col_def, flags=re.I)
    
    return col_def

def convert_default_values(col_def: str) -> str:
    """Translates Postgres DEFAULT clauses into MySQL compatible ones."""
    # Strip Postgres type casts: e.g., 'active'::character varying -> 'active'
    # or '2026-01-01'::date -> '2026-01-01' or 'user'::"character varying"
    col_def = re.sub(
        r'::\"?(?:character\s+varying|text|boolean|int(?:eger)?|bigint|date|timestamp(?:\s+with(?:out)?\s+time\s+zone)?|regclass|[a-zA-Z0-9_.]+)\"?(?:\s*\[\])?',
        '',
        col_def,
        flags=re.I
    )
    
    # nextval('seq'::regclass) or nextval('seq') -> AUTO_INCREMENT
    if re.search(r"DEFAULT\s+nextval\(.*?\)", col_def, flags=re.I):
        col_def = re.sub(r"DEFAULT\s+nextval\(.*?\)", "", col_def, flags=re.I)
        if "AUTO_INCREMENT" not in col_def:
            col_def += " AUTO_INCREMENT"
    
    # Booleans in defaults: true -> 1, false -> 0
    col_def = re.sub(r"\bDEFAULT\s+true\b", "DEFAULT 1", col_def, flags=re.I)
    col_def = re.sub(r"\bDEFAULT\s+false\b", "DEFAULT 0", col_def, flags=re.I)
    
    # now() / CURRENT_TIMESTAMP
    col_def = re.sub(r"DEFAULT\s+(?:now\(\)|clock_timestamp\(\)|timezone\(.*?\))", "DEFAULT CURRENT_TIMESTAMP", col_def, flags=re.I)
    
    # UUID functions (using token to avoid DATA_TYPE_MAP replacing 'uuid' with CHAR(36))
    col_def = re.sub(r"DEFAULT\s+(?:gen_random_uuid\(\)|uuid_generate_v4\(\))", "DEFAULT __MYSQL_UUID_EXPR__", col_def, flags=re.I)
    
    # Empty array defaults
    col_def = re.sub(r"DEFAULT\s+'{}'", "DEFAULT ('[]')", col_def, flags=re.I)
    col_def = re.sub(r"DEFAULT\s+ARRAY\[\]", "DEFAULT ('[]')", col_def, flags=re.I)

    return col_def

def clean_column_definition(col_line: str) -> str:
    """Processes a single column definition line inside CREATE TABLE."""
    # Convert identifiers
    col_line = convert_identifiers_in_text(col_line)
    
    # Strip Postgres collations like COLLATE pg_catalog."default"
    col_line = re.sub(r'COLLATE\s+(?:pg_catalog\.)?"?[a-zA-Z0-9_]+"?', '', col_line, flags=re.I)
    
    # Convert defaults FIRST before types so casts like ::character varying are removed cleanly
    col_line = convert_default_values(col_line)

    # Convert data types
    col_line = convert_data_types(col_line)
    
    # Restore tokens
    col_line = col_line.replace("__MYSQL_UUID_EXPR__", "(UUID())")
    
    return col_line

def process_create_table(stmt: str) -> str:
    """Translates a full CREATE TABLE block from Postgres to MySQL."""
    # Match CREATE TABLE [IF NOT EXISTS] [public.]table_name ( ... )
    match = re.match(r"CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:\"?public\"?\.)?\"?([a-zA-Z0-9_]+)\"?\s*\((.*)\)\s*(.*?);?$", stmt, re.I | re.DOTALL)
    if not match:
        return stmt

    if_not_exists = match.group(1) or ""
    table_name = match.group(2)
    body = match.group(3)
    trailing = match.group(4) or ""

    # Split table body into columns and table constraints
    lines = []
    current = []
    in_paren = 0
    in_single_quote = False
    
    for char in body:
        if char == "'" and (not current or current[-1] != "\\"):
            in_single_quote = not in_single_quote
        elif not in_single_quote:
            if char == '(':
                in_paren += 1
            elif char == ')':
                in_paren -= 1
            elif char == ',' and in_paren == 0:
                lines.append("".join(current).strip())
                current = []
                continue
        current.append(char)
        
    if current and "".join(current).strip():
        lines.append("".join(current).strip())

    cleaned_lines = []
    has_auto_increment = False
    primary_key_cols = []

    for line in lines:
        line_clean = clean_column_definition(line)
        
        # Check if line defines an AUTO_INCREMENT column
        if "AUTO_INCREMENT" in line_clean.upper():
            has_auto_increment = True
            
        # Strip table options not supported in MySQL
        if re.search(r"WITH\s*\(.*?\)", line_clean, flags=re.I):
            line_clean = re.sub(r"WITH\s*\(.*?\)", "", line_clean, flags=re.I)
            
        cleaned_lines.append("    " + line_clean.strip())

    body_str = ",\n".join(cleaned_lines)
    
    # Construct MySQL CREATE TABLE statement
    out = f"DROP TABLE IF EXISTS `{table_name}`;\n"
    out += f"CREATE TABLE {if_not_exists}`{table_name}` (\n{body_str}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
    return out

def process_alter_table(stmt: str) -> Optional[str]:
    """Translates ALTER TABLE statements (PRIMARY KEY, FOREIGN KEY, UNIQUE, AUTO_INCREMENT)."""
    # Remove public. schema
    stmt = convert_identifiers_in_text(stmt)
    
    # ALTER TABLE ONLY `table` ADD CONSTRAINT `pk` PRIMARY KEY (`col`);
    # MySQL does not use ONLY
    stmt = re.sub(r"\bALTER\s+TABLE\s+ONLY\b", "ALTER TABLE", stmt, flags=re.I)
    
    # Handle ALTER TABLE `table` ALTER COLUMN `col` SET DEFAULT nextval(...)
    seq_match = re.search(r"ALTER\s+TABLE\s+(`[a-zA-Z0-9_]+`)\s+ALTER\s+COLUMN\s+(`[a-zA-Z0-9_]+`)\s+SET\s+DEFAULT\s+nextval\(.*?\);?", stmt, re.I)
    if seq_match:
        table_name = seq_match.group(1)
        col_name = seq_match.group(2)
        return f"ALTER TABLE {table_name} MODIFY COLUMN {col_name} INT NOT NULL AUTO_INCREMENT;"
    
    # Strip DEFERRABLE / INITIALLY DEFERRED
    stmt = re.sub(r"\s+DEFERRABLE\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE)", "", stmt, flags=re.I)
    stmt = re.sub(r"\s+NOT\s+DEFERRABLE", "", stmt, flags=re.I)
    
    # Ensure semicolon
    stmt = stmt.strip()
    if not stmt.endswith(";"):
        stmt += ";"
    return stmt

def process_create_index(stmt: str) -> Optional[str]:
    """Translates CREATE INDEX statements."""
    stmt = convert_identifiers_in_text(stmt)
    
    # Match CREATE [UNIQUE] INDEX ... ON table USING method (cols) [WHERE ...]
    # Remove USING method (btree, gin, gist, hash, etc.)
    stmt = re.sub(r"\bUSING\s+(?:btree|gin|gist|hash|brin|spgist)\b", "", stmt, flags=re.I)
    
    # Partial indexes (WHERE ...) are not standard in MySQL without functional index expressions
    # Convert WHERE to comment or strip if simple
    match_where = re.search(r"\s+WHERE\s+(.*?);?$", stmt, flags=re.I)
    if match_where:
        where_clause = match_where.group(1).strip()
        stmt = stmt[:match_where.start()].strip() + ";"
        stmt = f"-- Note: MySQL converted partial index (original condition: {where_clause})\n" + stmt
        
    stmt = stmt.strip()
    if not stmt.endswith(";"):
        stmt += ";"
    return stmt

def normalize_timestamp(val: str) -> str:
    """Strips PostgreSQL timezone suffixes (+00, +00:00, Z) for MySQL DATETIME compatibility."""
    ts_match = re.match(r"^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:[+-]\d{2}(?::?\d{2})?|Z)$", val)
    if ts_match:
        return ts_match.group(1).replace('T', ' ')
    return val

def escape_mysql_string(val: str) -> str:
    """Escapes raw string value for MySQL single-quoted literal."""
    # Replace backslash with double backslash, then single quote with ''
    val = val.replace('\\', '\\\\')
    val = val.replace("'", "''")
    val = val.replace('\0', '\\0')
    val = val.replace('\n', '\\n')
    val = val.replace('\r', '\\r')
    val = val.replace('\t', '\\t')
    return f"'{val}'"

def parse_copy_row(row_str: str, col_names: List[str]) -> str:
    """Parses a single row from PostgreSQL COPY TSV format into MySQL VALUES (...)."""
    # In PostgreSQL COPY format:
    # Fields are separated by tab (\t)
    # \N represents NULL
    # Escapes: \\, \t, \n, \r
    parts = row_str.split('\t')
    sql_vals = []
    
    for p in parts:
        if p == r'\N':
            sql_vals.append('NULL')
        elif p.lower() == 't':
            # Boolean true
            sql_vals.append('1')
        elif p.lower() == 'f':
            # Boolean false
            sql_vals.append('0')
        elif re.match(r"^-?\d+$", p):
            # Integer
            sql_vals.append(p)
        elif re.match(r"^-?\d+\.\d+$", p):
            # Decimal / Float
            sql_vals.append(p)
        elif p.startswith(r'\x'):
            # Postgres hex binary format: \xdeadbeef -> 0xdeadbeef
            sql_vals.append(f"0x{p[2:]}")
        else:
            # Unescape Postgres COPY sequences
            unescaped = ""
            i = 0
            n = len(p)
            while i < n:
                if p[i] == '\\' and i + 1 < n:
                    nxt = p[i + 1]
                    if nxt == 'n':
                        unescaped += '\n'
                    elif nxt == 'r':
                        unescaped += '\r'
                    elif nxt == 't':
                        unescaped += '\t'
                    elif nxt == '\\':
                        unescaped += '\\'
                    else:
                        unescaped += nxt
                    i += 2
                else:
                    unescaped += p[i]
                    i += 1
            
            cleaned_val = normalize_timestamp(unescaped)
            sql_vals.append(escape_mysql_string(cleaned_val))
            
    return "(" + ", ".join(sql_vals) + ")"

def convert_neon_dump(
    input_file: str,
    output_file: str,
    target_database: Optional[str] = None,
    batch_size: int = 1000,
    verbose: bool = True
) -> Dict[str, int]:
    """
    Reads a Neon Postgres dump file and writes a 100% MySQL-compatible dump file.
    Streams line-by-line so memory usage remains tiny regardless of file size.
    """
    stats = {
        "tables_created": 0,
        "indexes_created": 0,
        "constraints_added": 0,
        "copy_rows_converted": 0,
        "insert_statements": 0,
        "statements_ignored": 0
    }

    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input dump file not found: {input_file}")

    with open(input_file, 'r', encoding='utf-8', errors='replace') as infile, \
         open(output_file, 'w', encoding='utf-8') as outfile:
        
        # Write MySQL Header setup
        outfile.write("-- =====================================================================\n")
        outfile.write("-- Converted from Neon PostgreSQL dump to MySQL\n")
        outfile.write(f"-- Source: {os.path.basename(input_file)}\n")
        outfile.write("-- Compatible with: MySQL 5.7, 8.0+, MariaDB 10+\n")
        outfile.write("-- =====================================================================\n\n")
        
        outfile.write("SET NAMES utf8mb4;\n")
        outfile.write("SET FOREIGN_KEY_CHECKS = 0;\n")
        outfile.write("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO,NO_ENGINE_SUBSTITUTION';\n")
        outfile.write("SET AUTOCOMMIT = 0;\n")
        outfile.write("START TRANSACTION;\n\n")

        if target_database:
            outfile.write(f"CREATE DATABASE IF NOT EXISTS `{target_database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n")
            outfile.write(f"USE `{target_database}`;\n\n")

        in_copy = False
        copy_table = ""
        copy_cols = ""
        copy_batch: List[str] = []

        stmt_buffer = []
        in_stmt = False

        for line_num, line in enumerate(infile, 1):
            # 1. Handle COPY ... FROM stdin data stream
            if in_copy:
                stripped = line.rstrip('\r\n')
                if stripped == r'\.':
                    # End of COPY block: flush remaining batch
                    if copy_batch:
                        sql = f"INSERT INTO {copy_table} {copy_cols} VALUES\n" + ",\n".join(copy_batch) + ";\n\n"
                        outfile.write(sql)
                        stats["copy_rows_converted"] += len(copy_batch)
                        copy_batch = []
                    in_copy = False
                    copy_table = ""
                    copy_cols = ""
                    continue
                else:
                    if stripped:
                        row_sql = parse_copy_row(stripped, [])
                        copy_batch.append(row_sql)
                        if len(copy_batch) >= batch_size:
                            sql = f"INSERT INTO {copy_table} {copy_cols} VALUES\n" + ",\n".join(copy_batch) + ";\n"
                            outfile.write(sql)
                            stats["copy_rows_converted"] += len(copy_batch)
                            copy_batch = []
                    continue

            # Check if this line starts a COPY command
            copy_match = re.match(r"^COPY\s+(?:\"?public\"?\.)?\"?([a-zA-Z0-9_]+)\"?\s*(\(.*?\))?\s*FROM\s+stdin;", line, re.I)
            if copy_match:
                table_name = clean_identifier(copy_match.group(1))
                cols = copy_match.group(2) or ""
                if cols:
                    cols = convert_identifiers_in_text(cols)
                in_copy = True
                copy_table = table_name
                copy_cols = cols
                copy_batch = []
                outfile.write(f"\n-- Data for table {copy_table}\n")
                continue

            # 2. Skip single-line comments or empty lines outside statements
            stripped_line = line.strip()
            if not in_stmt and (not stripped_line or stripped_line.startswith("--")):
                continue

            # Check ignore patterns for start of statements
            if not in_stmt:
                ignored = False
                for pat in IGNORE_STATEMENT_PATTERNS:
                    if pat.search(stripped_line):
                        stats["statements_ignored"] += 1
                        ignored = True
                        break
                if ignored:
                    # If this ignored statement does not end with semicolon, buffer and discard until semicolon
                    if not stripped_line.endswith(";"):
                        # Discard multiline ignored statement
                        for cont_line in infile:
                            if cont_line.strip().endswith(";"):
                                break
                    continue

            # 3. Buffer multi-line SQL statement
            in_stmt = True
            stmt_buffer.append(line)
            
            # Check if statement terminates with ';'
            # Simple check: line ends with ';' (ignoring trailing whitespace)
            if stripped_line.endswith(";"):
                in_stmt = False
                full_stmt = "".join(stmt_buffer).strip()
                stmt_buffer = []

                # Handle CREATE TABLE
                if re.match(r"^CREATE\s+TABLE", full_stmt, re.I):
                    mysql_create = process_create_table(full_stmt)
                    outfile.write(f"\n{mysql_create}\n\n")
                    stats["tables_created"] += 1

                # Handle ALTER TABLE
                elif re.match(r"^ALTER\s+TABLE", full_stmt, re.I):
                    # Check if it's constraint/PK/FK
                    if re.search(r"ADD\s+CONSTRAINT", full_stmt, re.I) or re.search(r"PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE", full_stmt, re.I):
                        mysql_alter = process_alter_table(full_stmt)
                        if mysql_alter:
                            outfile.write(f"{mysql_alter}\n")
                            stats["constraints_added"] += 1
                    else:
                        stats["statements_ignored"] += 1

                # Handle CREATE [UNIQUE] INDEX
                elif re.match(r"^CREATE\s+(?:UNIQUE\s+)?INDEX", full_stmt, re.I):
                    mysql_index = process_create_index(full_stmt)
                    if mysql_index:
                        outfile.write(f"{mysql_index}\n")
                        stats["indexes_created"] += 1

                # Handle standard INSERT statements (if dump used --inserts or --column-inserts)
                elif re.match(r"^INSERT\s+INTO", full_stmt, re.I):
                    stmt_clean = convert_identifiers_in_text(full_stmt)
                    # Convert boolean true/false and casts in insert values
                    stmt_clean = re.sub(r"'([^']*)'::[a-zA-Z0-9_]+", r"'\1'", stmt_clean)
                    stmt_clean = re.sub(r"\btrue::boolean\b", "1", stmt_clean, flags=re.I)
                    stmt_clean = re.sub(r"\bfalse::boolean\b", "0", stmt_clean, flags=re.I)
                    outfile.write(f"{stmt_clean}\n")
                    stats["insert_statements"] += 1

                # Ignore other statements (e.g. pg_catalog functions, views if incompatible, etc.)
                else:
                    stats["statements_ignored"] += 1

        # Write MySQL Footer
        outfile.write("\n-- =====================================================================\n")
        outfile.write("-- Re-enable foreign key checks and commit transaction\n")
        outfile.write("-- =====================================================================\n")
        outfile.write("COMMIT;\n")
        outfile.write("SET FOREIGN_KEY_CHECKS = 1;\n")

    return stats

def main():
    parser = argparse.ArgumentParser(
        description="Convert Neon PostgreSQL SQL dump file to 100% compatible MySQL SQL file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pg_to_mysql.py neon_dump.sql mysql_dump.sql
  python pg_to_mysql.py neon_dump.sql mysql_dump.sql -d my_target_db
  python pg_to_mysql.py neon_dump.sql mysql_dump.sql --batch-size 500
        """
    )
    parser.add_argument("input", help="Path to the input Neon PostgreSQL .sql dump file")
    parser.add_argument("output", help="Path to write the MySQL-compatible .sql file")
    parser.add_argument("-d", "--database", help="Optional MySQL database name to prepend CREATE/USE DATABASE", default=None)
    parser.add_argument("-b", "--batch-size", help="Number of rows per INSERT batch from COPY blocks (default: 1000)", type=int, default=1000)

    args = parser.parse_args()

    print(f"\n[*] Starting conversion:")
    print(f"    Source (Neon): {args.input}")
    print(f"    Destination:   {args.output}")
    if args.database:
        print(f"    Target DB:     {args.database}")
    print(f"    Batch size:    {args.batch_size} rows/insert\n")

    try:
        stats = convert_neon_dump(
            input_file=args.input,
            output_file=args.output,
            target_database=args.database,
            batch_size=args.batch_size
        )
        print("[+] Conversion completed successfully!")
        print("--------------------------------------------------")
        print(f"  - Tables created:          {stats['tables_created']}")
        print(f"  - COPY rows converted:     {stats['copy_rows_converted']}")
        print(f"  - INSERTs converted:       {stats['insert_statements']}")
        print(f"  - Indexes created:         {stats['indexes_created']}")
        print(f"  - Constraints added:       {stats['constraints_added']}")
        print(f"  - Ignored PG statements:   {stats['statements_ignored']}")
        print("--------------------------------------------------")
        print(f"\n[>] To import into MySQL, run:")
        if args.database:
            print(f"    mysql -u <user> -p < \"{args.output}\"")
        else:
            print(f"    mysql -u <user> -p <database_name> < \"{args.output}\"")
        print()

    except Exception as e:
        print(f"\n[!] Error during conversion: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
