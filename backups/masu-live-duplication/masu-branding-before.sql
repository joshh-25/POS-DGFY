-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: sku_inventory_manager
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
-- Table structure for table `tenants`
--

DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenants` (
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(255) NOT NULL,
  `domain` varchar(255) DEFAULT NULL,
  `subdomain` varchar(255) DEFAULT NULL,
  `db_name` varchar(255) NOT NULL,
  `company_token` varchar(255) NOT NULL,
  `db_host` varchar(255) DEFAULT 'localhost',
  `status` enum('pending','active','inactive','rejected','archived') NOT NULL DEFAULT 'pending',
  `plan` enum('standard','premium') NOT NULL DEFAULT 'standard',
  `billing_cycle_anchor` int(11) DEFAULT NULL COMMENT 'Day of month for billing (1-31)',
  `subscription_status` enum('active','inactive','past_due','cancelled','pending') DEFAULT 'inactive',
  `paypal_subscription_id` varchar(255) DEFAULT NULL,
  `current_period_end` datetime DEFAULT NULL,
  `trial_ends_at` datetime DEFAULT NULL,
  `settings` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`settings`)),
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `grace_period_end` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `last_expiry_notified_at` datetime DEFAULT NULL,
  `last_expiry_notification_type` varchar(255) DEFAULT NULL,
  `pending_plan` enum('standard','premium') DEFAULT NULL,
  `pending_plan_change_date` datetime DEFAULT NULL,
  `pending_plan_approved` tinyint(1) DEFAULT 0,
  `pending_paypal_subscription_id` varchar(255) DEFAULT NULL,
  `paypal_setup_initiated_at` datetime DEFAULT NULL,
  `payment_method` enum('manual','paypal','paymongo') NOT NULL DEFAULT 'manual',
  `reactivation_requested_at` datetime DEFAULT NULL,
  `rejection_reason` varchar(500) DEFAULT NULL,
  `paymongo_subscription_id` varchar(255) DEFAULT NULL,
  `pending_paymongo_subscription_id` varchar(255) DEFAULT NULL,
  `paymongo_setup_initiated_at` datetime DEFAULT NULL,
  `paymongo_source_id` varchar(255) DEFAULT NULL,
  `compliance_mode_state` enum('non_compliant_active','compliant_pending','compliant_active') DEFAULT NULL,
  `compliance_mode_choice_required` tinyint(1) NOT NULL DEFAULT 1,
  `compliance_mode_selected_at` datetime DEFAULT NULL,
  `compliance_mode_selected_by` varchar(120) DEFAULT NULL,
  `compliance_activated_at` datetime DEFAULT NULL,
  `compliance_policy_version` varchar(40) DEFAULT NULL,
  `compliance_profile` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`compliance_profile`)),
  `admin_email` varchar(255) DEFAULT NULL,
  `admin_password_hash` varchar(255) DEFAULT NULL,
  `compliance_mode_override_by` varchar(120) DEFAULT NULL,
  `compliance_mode_override_at` datetime DEFAULT NULL,
  `compliance_mode_override_reason` varchar(255) DEFAULT NULL,
  `compliance_mode_revert_by` varchar(120) DEFAULT NULL,
  `compliance_mode_revert_at` datetime DEFAULT NULL,
  `compliance_mode_revert_reason` varchar(255) DEFAULT NULL,
  `compliance_cycle_version` int(11) NOT NULL DEFAULT 0,
  `compliance_revert_last_cycle_version` int(11) NOT NULL DEFAULT 0,
  `admin_phone` varchar(40) DEFAULT NULL,
  `owner_dgfy_account_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `ownership_transferred_at` datetime DEFAULT NULL,
  `ownership_transferred_by` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `db_name` (`db_name`),
  UNIQUE KEY `company_token` (`company_token`),
  UNIQUE KEY `domain` (`domain`),
  UNIQUE KEY `subdomain` (`subdomain`),
  KEY `tenants_company_token` (`company_token`),
  KEY `tenants_domain` (`domain`),
  KEY `idx_tenants_owner_dgfy_account_id` (`owner_dgfy_account_id`),
  CONSTRAINT `tenants_owner_dgfy_account_id_foreign_idx` FOREIGN KEY (`owner_dgfy_account_id`) REFERENCES `dgfy_accounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tenants`
--

LOCK TABLES `tenants` WRITE;
/*!40000 ALTER TABLE `tenants` DISABLE KEYS */;
INSERT INTO `tenants` VALUES ('1fcb55dd-f007-4823-bee4-c818b47b6e9d','QA Store 1782538306207','qastore1782538306207-1fcb55dd',NULL,'sku_tenant_qastore1782538306207_1fcb55dd','token-qastore1782538306207-1fcb55dd','localhost','active','premium',NULL,'inactive',NULL,NULL,NULL,'{\"workflow_mode\":\"msme\"}','2026-06-27 05:31:48','2026-06-27 05:32:28',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,'manual',NULL,NULL,NULL,NULL,NULL,NULL,'non_compliant_active',0,'2026-06-27 05:31:48','registration',NULL,'2026.04.07','{}','qa.1782538306207@example.test','$2a$10$PLGq0Z3DIbyIIQel/AwP5OfHln6rEB8nM4vT/lenhVq5ox7UY4iIm',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'+639171234567','9f159119-9ec7-4ae3-99dc-83ca57572d22',NULL,NULL),('5c7888ce-da2d-4d88-a884-783c35b230af','krusty krab','krustykrab-5c7888ce',NULL,'sku_tenant_krustykrab_5c7888ce','token-krustykrab-5c7888ce','localhost','active','premium',NULL,'inactive',NULL,NULL,NULL,'{\"workflow_mode\":\"food_manufacturing\"}','2026-06-28 09:51:08','2026-06-28 09:51:55',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,'manual',NULL,NULL,NULL,NULL,NULL,NULL,'non_compliant_active',0,'2026-06-28 09:51:08','registration',NULL,'2026.04.07','{}','joshuaguto@gmail.com','$2a$10$J0kxwkZNgH47sAmDdV9X8..gW5tiXMiHHpR1j8j4s8ldKzIr/DJvu',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'+639234567823','edd2abe2-bb96-4424-a5e2-3169bad557ca',NULL,NULL),('77cba635-48db-41f5-8d02-55397a435ee2','Fish and Pork','fishandpork-77cba635',NULL,'sku_tenant_fishandpork_77cba635','token-fishandpork-77cba635','localhost','active','premium',NULL,'inactive',NULL,NULL,NULL,'{\"workflow_mode\":\"food_manufacturing\"}','2026-06-27 07:30:29','2026-06-27 07:30:47',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,'manual',NULL,NULL,NULL,NULL,NULL,NULL,'non_compliant_active',0,'2026-06-27 07:30:29','registration',NULL,'2026.04.07','{}','teamoleblanc@gmail.com','$2a$10$wlMS/yxB9rtWDYDNEoVxQ.NHLvuoacAYB9CWQU.htYUhNDdE6Zae.',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'+639162220362','189f2a56-f219-433b-8b03-4494818432d4',NULL,NULL),('d281c8f8-40f9-4d19-ae9e-63cd9cdfe2f2','HuboMoto','hubomoto-d281c8f8',NULL,'sku_tenant_hubomoto_d281c8f8','token-hubomoto-d281c8f8','localhost','active','premium',NULL,'inactive',NULL,NULL,NULL,'{\"workflow_mode\":\"food_manufacturing\"}','2026-06-27 07:29:25','2026-06-27 07:29:45',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,'manual',NULL,NULL,NULL,NULL,NULL,NULL,'non_compliant_active',0,'2026-06-27 07:29:25','registration',NULL,'2026.04.07','{}','teamoleblanc@gmail.com','$2a$10$wlMS/yxB9rtWDYDNEoVxQ.NHLvuoacAYB9CWQU.htYUhNDdE6Zae.',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'+639162220362','189f2a56-f219-433b-8b03-4494818432d4',NULL,NULL),('f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a','Acme Corporation','acmecorporation-f5d1f5e9',NULL,'sku_tenant_acmecorporation_f5d1f5e9','token-acmecorporation-f5d1f5e9','localhost','active','premium',NULL,'inactive',NULL,NULL,NULL,'{\"workflow_mode\": \"fnb\"}','2026-06-26 11:47:27','2026-06-26 11:47:45',NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,'manual',NULL,NULL,NULL,NULL,NULL,NULL,'non_compliant_active',0,'2026-06-26 11:47:27','registration',NULL,'2026.04.07','{}','admin@test.com','$2a$10$nJ00SE1kDZIecrKI3T9krOvd8maG.h1meOS/fCAUuS67MzuGaQjeG',NULL,NULL,NULL,NULL,NULL,NULL,0,0,'+639999000001','f2b49bba-6c01-45ac-a49b-46f3c9b6af38',NULL,NULL);
/*!40000 ALTER TABLE `tenants` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_tenants_compliance_no_downgrade
            BEFORE UPDATE ON tenants
            FOR EACH ROW
            BEGIN
                IF OLD.compliance_mode_state IN ('compliant_pending', 'compliant_active')
                   AND NEW.compliance_mode_state = 'non_compliant_active' THEN
                    IF (
                        (
                            NOT (NEW.compliance_mode_override_at <=> OLD.compliance_mode_override_at)
                            OR NOT (NEW.compliance_mode_override_by <=> OLD.compliance_mode_override_by)
                            OR NOT (NEW.compliance_mode_override_reason <=> OLD.compliance_mode_override_reason)
                        )
                        AND
                        (
                            NOT (NEW.compliance_mode_revert_at <=> OLD.compliance_mode_revert_at)
                            OR NOT (NEW.compliance_mode_revert_by <=> OLD.compliance_mode_revert_by)
                            OR NOT (NEW.compliance_mode_revert_reason <=> OLD.compliance_mode_revert_reason)
                            OR NOT (NEW.compliance_revert_last_cycle_version <=> OLD.compliance_revert_last_cycle_version)
                        )
                    ) THEN
                        SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Compliance downgrade must mutate either override markers or revert markers, not both';
                    END IF;

                    IF NOT (
                        (
                            NOT (NEW.compliance_mode_override_at <=> OLD.compliance_mode_override_at)
                            OR NOT (NEW.compliance_mode_override_by <=> OLD.compliance_mode_override_by)
                            OR NOT (NEW.compliance_mode_override_reason <=> OLD.compliance_mode_override_reason)
                        )
                        OR
                        (
                            NOT (NEW.compliance_mode_revert_at <=> OLD.compliance_mode_revert_at)
                            OR NOT (NEW.compliance_mode_revert_by <=> OLD.compliance_mode_revert_by)
                            OR NOT (NEW.compliance_mode_revert_reason <=> OLD.compliance_mode_revert_reason)
                            OR NOT (NEW.compliance_revert_last_cycle_version <=> OLD.compliance_revert_last_cycle_version)
                        )
                    ) THEN
                        SIGNAL SQLSTATE '45000'
                        SET MESSAGE_TEXT = 'Compliance downgrade requires governed marker mutation in the same update';
                    END IF;

                    IF (
                        NOT (NEW.compliance_mode_revert_at <=> OLD.compliance_mode_revert_at)
                        OR NOT (NEW.compliance_mode_revert_by <=> OLD.compliance_mode_revert_by)
                        OR NOT (NEW.compliance_mode_revert_reason <=> OLD.compliance_mode_revert_reason)
                        OR NOT (NEW.compliance_revert_last_cycle_version <=> OLD.compliance_revert_last_cycle_version)
                    ) THEN
                        IF COALESCE(NEW.compliance_cycle_version, 0) <= 0 THEN
                            SIGNAL SQLSTATE '45000'
                            SET MESSAGE_TEXT = 'Compliance cycle version is required for tenant revert';
                        END IF;

                        IF COALESCE(OLD.compliance_revert_last_cycle_version, 0) >= COALESCE(OLD.compliance_cycle_version, 0) THEN
                            SIGNAL SQLSTATE '45000'
                            SET MESSAGE_TEXT = 'Tenant revert to non-compliant already used for current compliance cycle';
                        END IF;

                        IF COALESCE(NEW.compliance_revert_last_cycle_version, 0) <> COALESCE(NEW.compliance_cycle_version, 0) THEN
                            SIGNAL SQLSTATE '45000'
                            SET MESSAGE_TEXT = 'Tenant revert must persist current compliance cycle version';
                        END IF;
                    END IF;
                END IF;

                IF OLD.compliance_mode_state IN ('compliant_pending', 'compliant_active')
                   AND NEW.compliance_mode_state IS NULL THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Compliance mode cannot be unset once compliant state has started';
                END IF;
            END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `storefront_discovery_index`
--

DROP TABLE IF EXISTS `storefront_discovery_index`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `storefront_discovery_index` (
  `storefront_discovery_index_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `tenant_name` varchar(255) NOT NULL,
  `tenant_company_token` varchar(255) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `storefront_open` tinyint(1) NOT NULL DEFAULT 1,
  `is_visible` tinyint(1) NOT NULL DEFAULT 1,
  `location_id` bigint(20) unsigned DEFAULT NULL,
  `location_name` varchar(255) DEFAULT NULL,
  `address_line` varchar(255) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `delivery_radius_km` decimal(10,2) NOT NULL DEFAULT 0.00,
  `estimated_wait_minutes` int(11) NOT NULL DEFAULT 15,
  `supports_delivery` tinyint(1) NOT NULL DEFAULT 1,
  `supports_pickup` tinyint(1) NOT NULL DEFAULT 1,
  `supports_dine_in` tinyint(1) NOT NULL DEFAULT 1,
  `store_delivery_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `catalog_count` int(10) unsigned NOT NULL DEFAULT 0,
  `source_updated_at` datetime DEFAULT NULL,
  `last_synced_at` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `active_location_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`active_location_snapshot`)),
  `item_search_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`item_search_snapshot`)),
  `search_snapshot_version` int(10) unsigned NOT NULL DEFAULT 1,
  `storefront_cover_image_url` varchar(500) DEFAULT NULL,
  `storefront_profile_image_url` varchar(500) DEFAULT NULL,
  `storefront_tagline` varchar(120) DEFAULT NULL,
  `storefront_about` varchar(1000) DEFAULT NULL,
  `storefront_phone` varchar(50) DEFAULT NULL,
  `storefront_email` varchar(120) DEFAULT NULL,
  `storefront_hours` varchar(120) DEFAULT NULL,
  `storefront_why_choose_us` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_why_choose_us`)),
  `storefront_social_links` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_social_links`)),
  `storefront_review_highlights` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_review_highlights`)),
  `storefront_promo` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_promo`)),
  `storefront_ui_v2_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `storefront_categories` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_categories`)),
  `storefront_gallery_images` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_gallery_images`)),
  `storefront_delivery_partners` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_delivery_partners`)),
  `storefront_follow_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `storefront_share_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `storefront_review_summary` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`storefront_review_summary`)),
  `workflow_mode` varchar(80) NOT NULL DEFAULT 'food_manufacturing',
  `customer_access_mode` varchar(32) NOT NULL DEFAULT 'catalog',
  `effective_customer_access_mode` varchar(32) NOT NULL DEFAULT 'transaction',
  `max_customer_access_mode` varchar(32) NOT NULL DEFAULT 'catalog',
  `inventory_display_mode` varchar(32) NOT NULL DEFAULT 'availability',
  `inventory_low_stock_display_threshold` int(10) unsigned NOT NULL DEFAULT 5,
  `access_capabilities` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`access_capabilities`)),
  `access_limitation_reason` varchar(255) DEFAULT NULL,
  `customer_access_modes_enabled` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`storefront_discovery_index_id`),
  UNIQUE KEY `idx_storefront_discovery_index_tenant_id` (`tenant_id`),
  UNIQUE KEY `idx_storefront_discovery_index_slug` (`slug`),
  KEY `idx_storefront_discovery_index_visible_open` (`is_visible`,`storefront_open`),
  KEY `idx_storefront_discovery_index_tenant_name` (`tenant_name`),
  KEY `idx_storefront_discovery_visible_open_name` (`is_visible`,`storefront_open`,`tenant_name`),
  KEY `idx_storefront_discovery_slug_visible` (`slug`,`is_visible`),
  KEY `idx_storefront_discovery_workflow_mode` (`workflow_mode`)
) ENGINE=InnoDB AUTO_INCREMENT=1923 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `storefront_discovery_index`
--

LOCK TABLES `storefront_discovery_index` WRITE;
/*!40000 ALTER TABLE `storefront_discovery_index` DISABLE KEYS */;
INSERT INTO `storefront_discovery_index` VALUES (1922,'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a','Acme Corporation','token-acmecorporation-f5d1f5e9','masu-cafe-ed841f',1,1,1,'Main Branch','City Proper, Iloilo City, Iloilo',10.6969040,122.5612700,5.00,15,1,1,1,0.00,59,'2026-06-29 08:40:43','2026-06-29 08:40:43','2026-06-29 08:40:43','2026-06-29 08:40:43','[{\"location_id\":1,\"name\":\"Main Branch\",\"address_line\":\"City Proper, Iloilo City, Iloilo\",\"latitude\":10.696904,\"longitude\":122.56127,\"is_open\":true,\"is_active\":true,\"is_primary_storefront\":true,\"supports_delivery\":true,\"supports_pickup\":true,\"supports_dine_in\":true,\"allow_out_of_stock_sales\":false}]','[{\"item_id\":1,\"item_name\":\"Vegetable Samosa\",\"category\":\"product\",\"text\":\"vegetable samosa masu 001 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":2,\"item_name\":\"Chicken Frankie Roll\",\"category\":\"product\",\"text\":\"chicken frankie roll masu 002 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":4,\"item_name\":\"Chicken Shawarma\",\"category\":\"product\",\"text\":\"chicken shawarma masu 004 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":5,\"item_name\":\"Cucumber Salad\",\"category\":\"product\",\"text\":\"cucumber salad masu 005 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":6,\"item_name\":\"Momos (Dumplings 5 pcs)\",\"category\":\"product\",\"text\":\"momos dumplings 5 pcs masu 006 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":7,\"item_name\":\"Pani Puri\",\"category\":\"product\",\"text\":\"pani puri masu 007 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":8,\"item_name\":\"French Fries\",\"category\":\"product\",\"text\":\"french fries masu 008 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":9,\"item_name\":\"Chicken Pakora\",\"category\":\"product\",\"text\":\"chicken pakora masu 009 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":10,\"item_name\":\"Vegetable Pakora\",\"category\":\"product\",\"text\":\"vegetable pakora masu 010 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":11,\"item_name\":\"Shrimp Pakora\",\"category\":\"product\",\"text\":\"shrimp pakora masu 011 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":12,\"item_name\":\"Papadums\",\"category\":\"product\",\"text\":\"papadums masu 012 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":13,\"item_name\":\"Beef Shawarma\",\"category\":\"product\",\"text\":\"beef shawarma masu 013 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":14,\"item_name\":\"Potato Egg Salad\",\"category\":\"product\",\"text\":\"potato egg salad masu 014 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":15,\"item_name\":\"Japanese Cucumber Salad\",\"category\":\"product\",\"text\":\"japanese cucumber salad masu 015 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":16,\"item_name\":\"Roti (Butter)\",\"category\":\"product\",\"text\":\"roti butter masu 016 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":17,\"item_name\":\"Garlic\",\"category\":\"product\",\"text\":\"garlic masu 017 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":18,\"item_name\":\"Pesto\",\"category\":\"product\",\"text\":\"pesto masu 018 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":19,\"item_name\":\"Cheese\",\"category\":\"product\",\"text\":\"cheese masu 019 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":20,\"item_name\":\"Butter\",\"category\":\"product\",\"text\":\"butter masu 020 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":21,\"item_name\":\"Chappati (Plain)\",\"category\":\"product\",\"text\":\"chappati plain masu 021 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":22,\"item_name\":\"Aloo Paratha (Potato & Green Peas)\",\"category\":\"product\",\"text\":\"aloo paratha potato green peas masu 022 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":23,\"item_name\":\"Tandoori (Plain)\",\"category\":\"product\",\"text\":\"tandoori plain masu 023 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":24,\"item_name\":\"Pizza Paratha (Cheese & Mushroom)\",\"category\":\"product\",\"text\":\"pizza paratha cheese mushroom masu 024 product finished goods aircon air con a c ac air conditioning air conditioner\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":25,\"item_name\":\"Roti Canai (Sweet Bread)\",\"category\":\"product\",\"text\":\"roti canai sweet bread masu 025 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":26,\"item_name\":\"Beef Meal\",\"category\":\"product\",\"text\":\"beef meal masu 026 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":27,\"item_name\":\"Chicken Meal\",\"category\":\"product\",\"text\":\"chicken meal masu 027 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":28,\"item_name\":\"Chorizo Meal\",\"category\":\"product\",\"text\":\"chorizo meal masu 028 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":29,\"item_name\":\"Burger Meal\",\"category\":\"product\",\"text\":\"burger meal masu 029 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":30,\"item_name\":\"Tomato Pasta\",\"category\":\"product\",\"text\":\"tomato pasta masu 030 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":31,\"item_name\":\"Pesto Pasta\",\"category\":\"product\",\"text\":\"pesto pasta masu 031 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":32,\"item_name\":\"Falooda\",\"category\":\"product\",\"text\":\"falooda masu 032 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":33,\"item_name\":\"Ice Cream\",\"category\":\"product\",\"text\":\"ice cream masu 033 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":34,\"item_name\":\"Gulab Jammon (Cold)\",\"category\":\"product\",\"text\":\"gulab jammon cold masu 034 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":35,\"item_name\":\"Gulab Jammon (Hot)\",\"category\":\"product\",\"text\":\"gulab jammon hot masu 035 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":36,\"item_name\":\"Chai Tea (Hot)\",\"category\":\"product\",\"text\":\"chai tea hot masu 036 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":37,\"item_name\":\"Chai Tea (Cold)\",\"category\":\"product\",\"text\":\"chai tea cold masu 037 product finished goods aircon air con a c ac air conditioning air conditioner\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":38,\"item_name\":\"Nestle Cucumber One Liter\",\"category\":\"product\",\"text\":\"nestle cucumber one liter masu 038 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":39,\"item_name\":\"Nestle Lemonade One Liter\",\"category\":\"product\",\"text\":\"nestle lemonade one liter masu 039 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":40,\"item_name\":\"Brewed Coffee\",\"category\":\"product\",\"text\":\"brewed coffee masu 040 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":41,\"item_name\":\"Sprite (Swakto)\",\"category\":\"product\",\"text\":\"sprite swakto masu 041 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":42,\"item_name\":\"Thai Ice Tea\",\"category\":\"product\",\"text\":\"thai ice tea masu 042 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":43,\"item_name\":\"Fresh Lemonade\",\"category\":\"product\",\"text\":\"fresh lemonade masu 043 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":44,\"item_name\":\"Hot Tea\",\"category\":\"product\",\"text\":\"hot tea masu 044 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":45,\"item_name\":\"Hot Calamansi Juice\",\"category\":\"product\",\"text\":\"hot calamansi juice masu 045 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":46,\"item_name\":\"Calamansi One Liter\",\"category\":\"product\",\"text\":\"calamansi one liter masu 046 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":47,\"item_name\":\"Nestle Ice Tea One Liter\",\"category\":\"product\",\"text\":\"nestle ice tea one liter masu 047 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":48,\"item_name\":\"Sharbat One Liter\",\"category\":\"product\",\"text\":\"sharbat one liter masu 048 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":49,\"item_name\":\"Coke (Can)\",\"category\":\"product\",\"text\":\"coke can masu 049 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":50,\"item_name\":\"Coke (12oz)\",\"category\":\"product\",\"text\":\"coke 12oz masu 050 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":51,\"item_name\":\"Sprite (12oz)\",\"category\":\"product\",\"text\":\"sprite 12oz masu 051 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":52,\"item_name\":\"Coke (Swakto)\",\"category\":\"product\",\"text\":\"coke swakto masu 052 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":53,\"item_name\":\"Cold Coffee\",\"category\":\"product\",\"text\":\"cold coffee masu 053 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":54,\"item_name\":\"Bottled Water\",\"category\":\"product\",\"text\":\"bottled water masu 054 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":55,\"item_name\":\"Plain Lassi\",\"category\":\"product\",\"text\":\"plain lassi masu 055 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":56,\"item_name\":\"Mango Lassi\",\"category\":\"product\",\"text\":\"mango lassi masu 056 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":57,\"item_name\":\"Cold Calamansi Juice\",\"category\":\"product\",\"text\":\"cold calamansi juice masu 057 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":58,\"item_name\":\"Ice Tea (Regular)\",\"category\":\"product\",\"text\":\"ice tea regular masu 058 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":59,\"item_name\":\"Ice Tea (Bottomless)\",\"category\":\"product\",\"text\":\"ice tea bottomless masu 059 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]},{\"item_id\":62,\"item_name\":\"Boiled Egg\",\"category\":\"product\",\"text\":\"boiled egg masu 062 product finished goods\",\"matching_location_ids\":[1],\"in_stock_location_ids\":[1]}]',1,NULL,NULL,'Authentic Indian-Nepalese flavors, warmly served.','Masu Cafe serves flavorful Indian–Nepalese dishes made with rich spices, comforting meals, and a warm café experience in Iloilo City.','09173085308','','Mon-Sat 10:00 AM - 8:00 PM','[\"Indian–Nepalese Flavors\",\"Spicy Comfort Meals\",\"Warm Café Dining\",\"Flavorful Rice Plates\"]','{\"messenger\":\"\",\"facebook\":\"https://www.facebook.com/profile.php?id=100064251120321\",\"instagram\":\"\"}','[]','{\"title\":\"\",\"subtitle\":\"\",\"badge\":\"\",\"validity_text\":\"\",\"active\":false}',1,'[\"Indian Cuisine Café\",\"Café\",\"Curry Dishes\",\"Biryani\",\"Vegetarian Meals\"]','[{\"url\":\"https://dgfy.ph/uploads/storefront-assets/ed841fc8-3eba-4728-a43a-8a6775cf07fd/gallery-1782375469436-49b32405.png\",\"path\":\"\",\"caption\":\"\",\"alt\":\"\",\"sort_order\":0},{\"url\":\"https://dgfy.ph/uploads/storefront-assets/ed841fc8-3eba-4728-a43a-8a6775cf07fd/gallery-1782375499995-8322b377.jpg\",\"path\":\"\",\"caption\":\"\",\"alt\":\"\",\"sort_order\":1},{\"url\":\"https://dgfy.ph/uploads/storefront-assets/ed841fc8-3eba-4728-a43a-8a6775cf07fd/gallery-1782375511327-17b9d891.png\",\"path\":\"\",\"caption\":\"\",\"alt\":\"\",\"sort_order\":2},{\"url\":\"https://dgfy.ph/uploads/storefront-assets/ed841fc8-3eba-4728-a43a-8a6775cf07fd/gallery-1782375527434-0836a912.png\",\"path\":\"\",\"caption\":\"\",\"alt\":\"\",\"sort_order\":3}]','[{\"partner\":\"foodpanda\",\"label\":\"Masu Cafe Food Panda\",\"url\":\"https://www.foodpanda.ph/restaurant/s58u/masu-cafe-villa-anita-street\"}]',1,1,'{\"score\":0,\"total_count\":0}','fnb','transaction','transaction','transaction','availability',5,'{\"profile\":true,\"contact\":true,\"catalog\":true,\"inventory\":true,\"inquiry\":false,\"cart\":true,\"quote\":true,\"checkout\":true,\"booking\":true,\"payment\":true}',NULL,1);
/*!40000 ALTER TABLE `storefront_discovery_index` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-29 16:42:55
