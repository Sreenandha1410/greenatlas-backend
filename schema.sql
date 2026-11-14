-- 1. Create database with UTF-8 support
CREATE DATABASE IF NOT EXISTS campus_trees
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE campus_trees;

-- 2. Areas Table
CREATE TABLE IF NOT EXISTS areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  area VARCHAR(150) NOT NULL UNIQUE,
  area_code VARCHAR(20) DEFAULT NULL,
  image_url TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  navigation_notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Species Table
CREATE TABLE IF NOT EXISTS species (
  species_id VARCHAR(100) PRIMARY KEY,
  common_name VARCHAR(255) NOT NULL,
  tamil_name VARCHAR(255) DEFAULT NULL,
  kingdom VARCHAR(100) DEFAULT 'Plantae',
  division VARCHAR(100) DEFAULT NULL,
  class VARCHAR(100) DEFAULT NULL,
  order_name VARCHAR(100) DEFAULT NULL,
  family VARCHAR(150) DEFAULT NULL,
  genus VARCHAR(100) DEFAULT NULL,
  species VARCHAR(100) DEFAULT NULL,
  origin VARCHAR(100) DEFAULT NULL,
  name_breakdown TEXT DEFAULT NULL,
  general_description TEXT DEFAULT NULL,
  avg_height VARCHAR(100) DEFAULT NULL,
  lifespan VARCHAR(100) DEFAULT NULL,
  growth_rate VARCHAR(100) DEFAULT NULL,
  flowering_season VARCHAR(150) DEFAULT NULL,
  fruiting_season VARCHAR(150) DEFAULT NULL,
  native_exotic VARCHAR(50) DEFAULT 'Native',
  pollination_method VARCHAR(150) DEFAULT NULL,
  wildlife_supported TEXT DEFAULT NULL,
  ecological_importance TEXT DEFAULT NULL,
  medicinal_uses TEXT DEFAULT NULL,
  economic_uses TEXT DEFAULT NULL,
  environmental_benefits TEXT DEFAULT NULL,
  cultural_significance TEXT DEFAULT NULL,
  interesting_facts TEXT DEFAULT NULL,
  conservation_status VARCHAR(100) DEFAULT 'Least Concern',
  image_url TEXT DEFAULT NULL,
  flora_type ENUM('tree', 'plant') DEFAULT 'tree',
  o2_produced_daily VARCHAR(50) DEFAULT NULL,
  co2_absorbed_daily VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_species_common (common_name),
  INDEX idx_species_family (family)
) ENGINE=InnoDB;

-- 4. Trees Table
CREATE TABLE IF NOT EXISTS trees (
  tree_id VARCHAR(50) PRIMARY KEY,
  botanical_name VARCHAR(255) DEFAULT NULL,
  common_name VARCHAR(255) NOT NULL,
  family VARCHAR(150) DEFAULT NULL,
  area VARCHAR(150) DEFAULT NULL,
  latitude DECIMAL(10, 8) DEFAULT NULL,
  longitude DECIMAL(11, 8) DEFAULT NULL,
  age INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  image_link TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trees_area (area),
  INDEX idx_trees_family (family),
  INDEX idx_trees_coords (latitude, longitude)
) ENGINE=InnoDB;

-- 5. Tree Images Table
CREATE TABLE IF NOT EXISTS tree_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tree_id VARCHAR(50) NOT NULL,
  image_url TEXT NOT NULL,
  caption VARCHAR(255) DEFAULT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tree_id) REFERENCES trees(tree_id) ON DELETE CASCADE,
  INDEX idx_images_tree (tree_id)
) ENGINE=InnoDB;

-- 6. Location Audit History Table
CREATE TABLE IF NOT EXISTS tree_location_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tree_id VARCHAR(50) NOT NULL,
  old_latitude DECIMAL(10, 8) DEFAULT NULL,
  old_longitude DECIMAL(11, 8) DEFAULT NULL,
  new_latitude DECIMAL(10, 8) NOT NULL,
  new_longitude DECIMAL(11, 8) NOT NULL,
  changed_by VARCHAR(255) DEFAULT 'admin',
  reason VARCHAR(500) DEFAULT NULL,
  action VARCHAR(20) DEFAULT 'UPDATE',
  undo_of_id INT DEFAULT NULL,
  reversed_by_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tree_id) REFERENCES trees(tree_id) ON DELETE CASCADE,
  INDEX idx_history_tree (tree_id)
) ENGINE=InnoDB;

-- 7. Complaints Table
CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_name VARCHAR(150) NOT NULL,
  department VARCHAR(150) NOT NULL,
  tree_id VARCHAR(50) NOT NULL,
  tree_name VARCHAR(255) DEFAULT NULL,
  tree_area VARCHAR(150) DEFAULT NULL,
  issue_type VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  image_url TEXT DEFAULT NULL,
  status ENUM('Pending', 'In Progress', 'Resolved') DEFAULT 'Pending',
  admin_notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_complaints_status (status)
) ENGINE=InnoDB;

-- 8. Users (Admin) Table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 9. Page Views Analytics Table
CREATE TABLE IF NOT EXISTS page_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  path VARCHAR(255) DEFAULT '/',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS tree_boards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  board_id VARCHAR(50) NOT NULL UNIQUE,
  primary_tree_id VARCHAR(50) NOT NULL,
  board_type ENUM('individual', 'group') DEFAULT 'individual',
  status ENUM('Need to Fix', 'Board Fixed', 'Requires Maintenance') DEFAULT 'Need to Fix',
  group_tree_ids JSON DEFAULT NULL,
  group_count INT NOT NULL DEFAULT 1,
  location_description VARCHAR(500) DEFAULT NULL,
  area VARCHAR(150) DEFAULT NULL,
  installed_date DATE DEFAULT NULL,
  last_checked DATE DEFAULT NULL,
  installed_by VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (primary_tree_id) REFERENCES trees(tree_id) ON DELETE CASCADE,
  INDEX idx_boards_status (status),
  INDEX idx_boards_type (board_type),
  INDEX idx_boards_area (area)
) ENGINE=InnoDB;
