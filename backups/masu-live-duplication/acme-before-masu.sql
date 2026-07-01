-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: sku_tenant_acmecorporation_f5d1f5e9
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_settings` (
  `setting_id` int(11) NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `data_type` enum('string','number','boolean','json') DEFAULT 'string',
  `description` text DEFAULT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`setting_id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  UNIQUE KEY `setting_key_2` (`setting_key`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_settings`
--

LOCK TABLES `system_settings` WRITE;
/*!40000 ALTER TABLE `system_settings` DISABLE KEYS */;
INSERT INTO `system_settings` VALUES (1,'ops_workflow_mode','fnb','string','Business Mode','2026-06-26 11:47:45'),(2,'tenant_onboarding_state','not_started','string','Tenant onboarding state (not_started | in_progress | completed)','2026-06-26 11:47:45'),(3,'tenant_onboarding_started_at','','string','ISO timestamp for tenant onboarding start','2026-06-26 11:47:45'),(4,'tenant_onboarding_completed_at','','string','ISO timestamp for tenant onboarding completion','2026-06-26 11:47:45'),(5,'tenant_onboarding_progress','{\"step_payloads\":{\"business_classification\":{\"legitimacy\":{\"registration_status\":\"registered\"}}},\"classification_snapshot\":{\"payload\":{\"legitimacy\":{\"registration_status\":\"registered\"}}},\"checklist_snapshot\":{\"checklist\":{\"store_name_ready\":true,\"has_primary_storefront_location\":false,\"has_priced_starter_item\":false},\"required_keys\":[\"store_name_ready\",\"has_primary_storefront_location\",\"has_priced_starter_item\"],\"required_total\":3,\"completed_required_count\":1,\"is_ready\":false,\"missing_requirements\":[\"has_primary_storefront_location\",\"has_priced_starter_item\"]}}','json','Tenant onboarding progress and checklist snapshot','2026-06-26 11:47:45'),(6,'store_is_visible','true','boolean','Controls whether the tenant appears in public discovery and public storefront profile reads','2026-06-28 16:10:23'),(7,'customer_access_mode','transaction','string','Requested storefront customer access mode (ghost | catalog | inquiry | transaction)','2026-06-28 16:33:22'),(8,'inventory_display_mode','availability','string','Customer-facing inventory display mode (hidden | availability | low_stock | exact_quantity)','2026-06-26 11:47:45'),(9,'inventory_low_stock_display_threshold','5','number','Public low-stock display threshold for storefront inventory labels','2026-06-26 11:47:45'),(10,'storefront_profile_image_path','storefront-assets/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/profile-1782659399873-250b7346.jpg','string','Auto-created by settings update flow for key \'storefront_profile_image_path\'','2026-06-28 15:09:59'),(11,'storefront_profile_image_url','/uploads/storefront-assets/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/profile-1782659399873-250b7346.jpg','string','Auto-created by settings update flow for key \'storefront_profile_image_url\'','2026-06-28 15:09:59'),(12,'storefront_cover_image_path','storefront-assets/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/cover-1782659405095-33149c9b.jpg','string','Auto-created by settings update flow for key \'storefront_cover_image_path\'','2026-06-28 15:10:05'),(13,'storefront_cover_image_url','/uploads/storefront-assets/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/cover-1782659405095-33149c9b.jpg','string','Auto-created by settings update flow for key \'storefront_cover_image_url\'','2026-06-28 15:10:05'),(14,'pos_terminal_registry','[{\"terminal_id\":\"JOHN-01\",\"label\":\"Cashie Jaro Branch\",\"location_id\":1,\"is_active\":true,\"is_default\":true,\"terminal_password_hash\":\"$2a$10$Qyisf4cgIVEEHxeRBQRXdeF8XpkonshwpFPgVJUdmZnZ7wvRJwU3e\"}]','json','Auto-created by settings update flow for key \'pos_terminal_registry\'','2026-06-29 08:13:52'),(15,'pos_terminal_registry_mode','warn','string','Auto-created by settings update flow for key \'pos_terminal_registry_mode\'','2026-06-28 07:49:17'),(16,'pos_terminal_location_binding_enforced','false','boolean','Auto-created by settings update flow for key \'pos_terminal_location_binding_enforced\'','2026-06-28 07:49:17'),(17,'store_has_no_location','false','boolean','Auto-created by settings update flow for key \'store_has_no_location\'','2026-06-28 16:14:42'),(18,'storefront_tagline','','string','Auto-created by settings update flow for key \'storefront_tagline\'','2026-06-28 16:10:23'),(19,'storefront_phone','','string','Auto-created by settings update flow for key \'storefront_phone\'','2026-06-28 16:10:23'),(20,'storefront_email','','string','Auto-created by settings update flow for key \'storefront_email\'','2026-06-28 16:10:23'),(21,'storefront_about','','string','Auto-created by settings update flow for key \'storefront_about\'','2026-06-28 16:10:23'),(22,'storefront_hours','{\"mode\":\"weekly\",\"timezone\":\"Asia/Manila\",\"weekly\":{\"sun\":{\"enabled\":true,\"open\":\"00:00\",\"close\":\"00:00\"},\"mon\":{\"enabled\":true,\"open\":\"00:00\",\"close\":\"00:00\"},\"tue\":{\"enabled\":true,\"open\":\"00:00\",\"close\":\"00:00\"},\"wed\":{\"enabled\":true,\"open\":\"00:00\",\"close\":\"00:00\"},\"thu\":{\"enabled\":true,\"open\":\"00:00\",\"close\":\"00:00\"},\"fri\":{\"enabled\":true,\"open\":\"00:00\",\"close\":\"00:00\"},\"sat\":{\"enabled\":true,\"open\":\"00:00\",\"close\":\"00:00\"}},\"display\":\"Sun-Sat 24 hours\"}','json','Auto-created by settings update flow for key \'storefront_hours\'','2026-06-29 08:13:24'),(23,'storefront_why_choose_us','[]','json','Auto-created by settings update flow for key \'storefront_why_choose_us\'','2026-06-28 16:10:23'),(24,'storefront_social_links','{\"messenger\":\"\",\"facebook\":\"\",\"instagram\":\"\"}','json','Auto-created by settings update flow for key \'storefront_social_links\'','2026-06-28 16:10:23'),(25,'storefront_ui_v2_enabled','false','boolean','Auto-created by settings update flow for key \'storefront_ui_v2_enabled\'','2026-06-28 16:10:23'),(26,'storefront_categories','[]','json','Auto-created by settings update flow for key \'storefront_categories\'','2026-06-28 16:10:23'),(27,'storefront_gallery_images','[]','json','Auto-created by settings update flow for key \'storefront_gallery_images\'','2026-06-28 16:10:23'),(28,'storefront_delivery_partners','[{\"partner\":\"grab\",\"label\":\"\",\"url\":\"\"}]','json','Auto-created by settings update flow for key \'storefront_delivery_partners\'','2026-06-28 16:10:23'),(29,'storefront_review_highlights','[]','json','Auto-created by settings update flow for key \'storefront_review_highlights\'','2026-06-28 16:10:23'),(30,'storefront_review_summary','{\"score\":0,\"total_count\":0,\"star_distribution\":{\"1\":0,\"2\":0,\"3\":0,\"4\":0,\"5\":0}}','json','Auto-created by settings update flow for key \'storefront_review_summary\'','2026-06-28 16:10:23'),(31,'storefront_promo','{\"title\":\"\",\"subtitle\":\"\",\"badge\":\"\",\"validity_text\":\"\",\"active\":false}','json','Auto-created by settings update flow for key \'storefront_promo\'','2026-06-28 16:10:23'),(32,'storefront_follow_enabled','true','boolean','Auto-created by settings update flow for key \'storefront_follow_enabled\'','2026-06-28 16:16:35'),(33,'storefront_share_enabled','true','boolean','Auto-created by settings update flow for key \'storefront_share_enabled\'','2026-06-28 16:16:35');
/*!40000 ALTER TABLE `system_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tenant_locations`
--

DROP TABLE IF EXISTS `tenant_locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenant_locations` (
  `location_id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `address_line` text NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `delivery_radius_km` decimal(5,2) NOT NULL DEFAULT 5.00,
  `is_open` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_primary_storefront` tinyint(1) NOT NULL DEFAULT 0,
  `operating_hours` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`operating_hours`)),
  `current_wait_time_minutes` int(11) NOT NULL DEFAULT 15,
  `allow_out_of_stock_sales` tinyint(1) NOT NULL DEFAULT 0,
  `supports_delivery` tinyint(1) NOT NULL DEFAULT 1,
  `supports_pickup` tinyint(1) NOT NULL DEFAULT 1,
  `supports_dine_in` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`location_id`),
  KEY `tenant_locations_name` (`name`),
  KEY `tenant_locations_is_active` (`is_active`),
  KEY `tenant_locations_is_open` (`is_open`),
  KEY `tenant_locations_is_primary_storefront_is_active` (`is_primary_storefront`,`is_active`),
  KEY `tenant_locations_latitude_longitude` (`latitude`,`longitude`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenant_locations`
--

LOCK TABLES `tenant_locations` WRITE;
/*!40000 ALTER TABLE `tenant_locations` DISABLE KEYS */;
INSERT INTO `tenant_locations` VALUES (1,'Acme Corporation','Bernwood Tower, Ibarra Street, Aurora Subdivision, Rizal Estanzuela, City Proper, Iloilo City, Western Visayas, 5000, Philippines',10.69978580,122.55968460,5.00,1,1,1,NULL,15,0,1,1,1,'2026-06-27 14:42:10','2026-06-27 14:42:10'),(2,'Ungka Branch','Ungka Old Railway Road, Ungka, Western Visayas, 5000',10.74539000,122.53884100,5.00,1,1,0,NULL,15,0,1,1,1,'2026-06-28 16:27:37','2026-06-28 16:27:37');
/*!40000 ALTER TABLE `tenant_locations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `items`
--

DROP TABLE IF EXISTS `items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `items` (
  `item_id` int(11) NOT NULL AUTO_INCREMENT,
  `sku_code` varchar(50) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `category` enum('raw_material','packaging','product','supplies','service') NOT NULL,
  `product_type` enum('work_in_progress','finished_goods') DEFAULT NULL,
  `mode_item_preset` varchar(64) DEFAULT NULL COMMENT 'Corrected workflow-mode item preset key used to preserve mode-native item subtype semantics',
  `product_folder` varchar(100) DEFAULT NULL,
  `folder_id` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `current_stock` decimal(24,12) DEFAULT 0.000000000000,
  `max_capacity` decimal(24,12) DEFAULT NULL,
  `min_threshold` decimal(24,12) DEFAULT NULL,
  `purchase_allowance` decimal(24,12) DEFAULT NULL,
  `unit_of_measure` varchar(50) DEFAULT NULL,
  `cost_per_unit` decimal(10,4) DEFAULT NULL,
  `default_sale_price` decimal(10,4) DEFAULT NULL COMMENT 'Last-used explicit sale price used by POS, Storefront, and Dispatch Orders. Auto-updated from DO dispatches.',
  `vat_type` enum('vatable','vat_exempt','zero_rated') NOT NULL DEFAULT 'vatable' COMMENT 'Default VAT classification used by POS and snapshotted at transaction-line level',
  `fifo_enabled` tinyint(1) DEFAULT 1,
  `shelf_life_days` int(11) DEFAULT NULL COMMENT 'Shelf life in days for unopened items (optional - used for expiry tracking when fifo_enabled is true)',
  `opened_shelf_life_days` int(11) DEFAULT NULL COMMENT 'Shelf life in days after opening',
  `batch_size` decimal(24,12) DEFAULT NULL,
  `yield_percentage` decimal(5,2) DEFAULT NULL,
  `processing_loss` decimal(5,2) DEFAULT NULL,
  `production_notes` text DEFAULT NULL,
  `packaging_specs` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`packaging_specs`)),
  `status` enum('draft','active','inactive') DEFAULT 'active',
  `nesting_level` int(11) DEFAULT 0 COMMENT '0=raw ingredient, 1-3=nested product levels',
  `max_child_depth` int(11) DEFAULT 0,
  `is_leaf_node` tinyint(1) DEFAULT 1,
  `composition_hash` varchar(64) DEFAULT NULL,
  `wizard_metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Stores wizard progress for draft products' CHECK (json_valid(`wizard_metadata`)),
  `deleted_by` int(11) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`item_id`),
  KEY `items_sku_code` (`sku_code`),
  KEY `items_category` (`category`),
  KEY `items_mode_item_preset` (`mode_item_preset`),
  KEY `items_folder_id` (`folder_id`),
  KEY `items_deleted_at` (`deleted_at`),
  KEY `items_status` (`status`),
  KEY `deleted_by` (`deleted_by`),
  CONSTRAINT `items_ibfk_1` FOREIGN KEY (`folder_id`) REFERENCES `item_folders` (`folder_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `items_ibfk_2` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `items`
--

LOCK TABLES `items` WRITE;
/*!40000 ALTER TABLE `items` DISABLE KEYS */;
INSERT INTO `items` VALUES (1,'PRD-FF-001','Fish Fingers','product','finished_goods','finished_product','Mains',7,'',100.000000000000,100.000000000000,40.000000000000,20.000000000000,'pcs',70.0000,90.0000,'vatable',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'active',0,0,1,NULL,NULL,NULL,NULL,'2026-06-28 10:36:54','2026-06-28 11:11:11'),(2,'PRD-PS-001','Pork Sisig','product','finished_goods','finished_product','Mains',7,'',100.000000000000,100.000000000000,40.000000000000,20.000000000000,'pcs',89.0000,90.0000,'vatable',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'active',0,0,1,NULL,NULL,NULL,NULL,'2026-06-28 10:37:28','2026-06-28 10:37:28'),(3,'PRD-PB-001','Patty Burger','product','finished_goods','finished_product','Burgers And Sandwiches',3,'',100.000000000000,100.000000000000,40.000000000000,20.000000000000,'pcs',90.0000,150.0000,'vatable',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'active',0,0,1,NULL,NULL,NULL,NULL,'2026-06-28 10:39:26','2026-06-28 10:39:26'),(4,'PRD-OJ-001','Orange Juice','product','finished_goods','finished_product','Non Espresso Based Beverages',9,'',150.000000000000,150.000000000000,60.000000000000,30.000000000000,'pcs',45.0000,90.0000,'vatable',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'active',0,0,1,NULL,NULL,NULL,NULL,'2026-06-28 10:40:37','2026-06-28 10:40:37'),(5,'PRD-CN-001','Chicken Nuggets','product','finished_goods','finished_product','Mains',7,'',0.000000000000,1.000000000000,0.000000000000,0.000000000000,'pcs',100.0000,130.0000,'vatable',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'active',0,0,1,NULL,NULL,NULL,NULL,'2026-06-28 14:44:23','2026-06-28 14:44:34'),(6,'PRD-C-001','Coffee','product','finished_goods','finished_product','Espresso Based Beverages',4,'',0.000000000000,1.000000000000,0.000000000000,0.000000000000,'pcs',100.0000,150.0000,'vatable',1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'active',0,0,1,NULL,NULL,NULL,NULL,'2026-06-29 06:27:46','2026-06-29 06:27:46');
/*!40000 ALTER TABLE `items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `storefront_catalog_overrides`
--

DROP TABLE IF EXISTS `storefront_catalog_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `storefront_catalog_overrides` (
  `storefront_catalog_override_id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `storefront_visible` tinyint(1) NOT NULL DEFAULT 1,
  `storefront_image_path` varchar(500) DEFAULT NULL,
  `storefront_image_url` varchar(500) DEFAULT NULL,
  `storefront_image_gallery` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_image_gallery`)),
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`storefront_catalog_override_id`),
  UNIQUE KEY `item_id` (`item_id`),
  UNIQUE KEY `storefront_catalog_overrides_item_id` (`item_id`),
  CONSTRAINT `storefront_catalog_overrides_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `storefront_catalog_overrides`
--

LOCK TABLES `storefront_catalog_overrides` WRITE;
/*!40000 ALTER TABLE `storefront_catalog_overrides` DISABLE KEYS */;
INSERT INTO `storefront_catalog_overrides` VALUES (1,1,1,'storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-1-1782643014891.jpg','/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-1-1782643014891.jpg','[{\"path\":\"storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-1-1782643014891.jpg\",\"url\":\"/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-1-1782643014891.jpg\",\"is_primary\":true,\"sort_order\":0}]','2026-06-28 10:36:54','2026-06-28 10:36:55'),(2,2,1,'storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-2-1782643049124.jpg','/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-2-1782643049124.jpg','[{\"path\":\"storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-2-1782643049124.jpg\",\"url\":\"/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-2-1782643049124.jpg\",\"is_primary\":true,\"sort_order\":0}]','2026-06-28 10:37:29','2026-06-28 10:37:29'),(3,3,1,'storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-3-1782643167142.jpg','/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-3-1782643167142.jpg','[{\"path\":\"storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-3-1782643167142.jpg\",\"url\":\"/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-3-1782643167142.jpg\",\"is_primary\":true,\"sort_order\":0}]','2026-06-28 10:39:27','2026-06-28 10:39:27'),(4,4,1,'storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-4-1782643237680.jpg','/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-4-1782643237680.jpg','[{\"path\":\"storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-4-1782643237680.jpg\",\"url\":\"/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-4-1782643237680.jpg\",\"is_primary\":true,\"sort_order\":0}]','2026-06-28 10:40:37','2026-06-28 10:40:37'),(5,5,1,'storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-5-1782657863861.jpg','/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-5-1782657863861.jpg','[{\"path\":\"storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-5-1782657863861.jpg\",\"url\":\"/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-5-1782657863861.jpg\",\"is_primary\":true,\"sort_order\":0}]','2026-06-28 14:44:23','2026-06-28 14:44:23'),(6,6,1,'storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-6-1782714467219.jpg','/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-6-1782714467219.jpg','[{\"path\":\"storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-6-1782714467219.jpg\",\"url\":\"/uploads/storefront-catalog/f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a/item-6-1782714467219.jpg\",\"is_primary\":true,\"sort_order\":0}]','2026-06-29 06:27:47','2026-06-29 06:27:47');
/*!40000 ALTER TABLE `storefront_catalog_overrides` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `storefront_location_item_overrides`
--

DROP TABLE IF EXISTS `storefront_location_item_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `storefront_location_item_overrides` (
  `storefront_location_item_override_id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `location_id` int(11) NOT NULL,
  `storefront_available` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`storefront_location_item_override_id`),
  UNIQUE KEY `storefront_location_item_overrides_item_id_location_id` (`item_id`,`location_id`),
  KEY `storefront_location_item_overrides_location_id` (`location_id`),
  KEY `storefront_location_item_overrides_storefront_available` (`storefront_available`),
  CONSTRAINT `storefront_location_item_overrides_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `storefront_location_item_overrides_ibfk_2` FOREIGN KEY (`location_id`) REFERENCES `tenant_locations` (`location_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `storefront_location_item_overrides`
--

LOCK TABLES `storefront_location_item_overrides` WRITE;
/*!40000 ALTER TABLE `storefront_location_item_overrides` DISABLE KEYS */;
/*!40000 ALTER TABLE `storefront_location_item_overrides` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-29 16:24:01
