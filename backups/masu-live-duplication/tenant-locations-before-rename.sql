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
INSERT INTO `tenant_locations` VALUES (1,'Main Branch','City Proper, Iloilo City, Iloilo',10.69690400,122.56127000,5.00,1,1,1,NULL,15,0,1,1,1,'2026-06-27 14:42:10','2026-06-29 08:29:26'),(2,'Ungka Branch','Ungka Old Railway Road, Ungka, Western Visayas, 5000',10.74539000,122.53884100,5.00,1,0,0,NULL,15,0,1,1,1,'2026-06-28 16:27:37','2026-06-29 08:29:26');
/*!40000 ALTER TABLE `tenant_locations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-29 16:56:45
