# System Architecture Diagrams & Technical Documentation

## Table of Contents

> **Navigation Tip:** Click a diagram name to jump directly to that section.

### System Overview
- [1. High-Level System Architecture](#1-high-level-system-architecture)
- [2. Database Architecture](#2-database-architecture)
- [3. Request-Response Flow](#3-request-response-flow)

### Data Flows
- [4. Data Flow - Purchase Order to Inventory Update](#4-data-flow---purchase-order-to-inventory-update)
- [5. Data Flow - Job Order Production](#5-data-flow---job-order-production)
- [6. Inventory Tracking - FIFO Batch Management](#6-inventory-tracking---fifo-batch-management)

### System Features
- [7. Alert & Notification System](#7-alert--notification-system)
- [8. User Authentication & Authorization Flow](#8-user-authentication--authorization-flow)
- [9. Deployment Architecture](#9-deployment-architecture)
- [10. Frontend Component Architecture](#10-frontend-component-architecture)

### Operations
- [11. Error Handling & Recovery Flow](#11-error-handling--recovery-flow)
- [12. Scalability & Performance Optimization](#12-scalability--performance-optimization)
- [13. Security Layers](#13-security-layers)

---

# System Architecture Diagrams & Technical Documentation

## 1. High-Level System Architecture

> **Reference Diagram**: See [System Architecture Diagram](./images/system-architecture-diagram.png) for a visual overview of the complete system architecture.

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Web["React Web Application<br/>Vite + React Router<br/>TailwindCSS"]
        Mobile["Mobile App<br/>(Future)"]
    end
    
    subgraph Gateway["API Gateway Layer"]
        Auth["Authentication<br/>JWT + OAuth"]
        RateLimit["Rate Limiting<br/>& Throttling"]
        CORS["CORS<br/>& Security"]
    end
    
    subgraph Backend["Backend Services"]
        ItemSvc["Item Management<br/>Service"]
        SupplierSvc["Supplier<br/>Service"]
        ProcurementSvc["Procurement<br/>Service"]
        ProductionSvc["Production<br/>Service"]
        ReportSvc["Reporting<br/>Service"]
        ForecastSvc["Forecasting<br/>Service"]
    end
    
    subgraph Data["Data Layer"]
        MySQL["MySQL Database<br/>8.0+"]
        Redis["Redis Cache<br/>Session & Data"]
        S3["S3 Storage<br/>Files & Exports"]
    end
    
    subgraph Jobs["Background Jobs"]
        StockAlert["Stock Alert<br/>Generator"]
        ForecastJob["Forecast<br/>Calculator"]
        ReportJob["Report<br/>Generator"]
        CleanupJob["Data Cleanup<br/>& Archival"]
    end
    
    subgraph Notifications["Notification System"]
        WebSocket["WebSocket<br/>Real-time Updates"]
        Email["Email<br/>Notifications"]
        SMS["SMS Alerts<br/>(Future)"]
    end
    
    Web -->|HTTP/REST| Auth
    Mobile -->|HTTP/REST| Auth
    
    Auth --> RateLimit
    RateLimit --> CORS
    
    CORS --> ItemSvc
    CORS --> SupplierSvc
    CORS --> ProcurementSvc
    CORS --> ProductionSvc
    CORS --> ReportSvc
    CORS --> ForecastSvc
    
    ItemSvc --> MySQL
    SupplierSvc --> MySQL
    ProcurementSvc --> MySQL
    ProductionSvc --> MySQL
    ReportSvc --> MySQL
    ForecastSvc --> MySQL
    
    ItemSvc --> Redis
    SupplierSvc --> Redis
    
    ItemSvc --> S3
    ReportSvc --> S3
    
    StockAlert --> MySQL
    ForecastJob --> MySQL
    ReportJob --> MySQL
    CleanupJob --> MySQL
    
    StockAlert --> WebSocket
    ForecastJob --> WebSocket
    
    WebSocket --> Web
    Email --> Web
    
    style Client fill:#e1f5ff
    style Gateway fill:#fff3e0
    style Backend fill:#f3e5f5
    style Data fill:#e8f5e9
    style Jobs fill:#fce4ec
    style Notifications fill:#fff9c4
```

---

## 2. Database Architecture

```mermaid
graph LR
    subgraph Core["Core Inventory"]
        Items["Items<br/>(SKU Master)"]
        Batches["FIFO Batches"]
        Movements["Stock Movements"]
        Transactions["Batch Transactions"]
    end
    
    subgraph Procurement["Procurement"]
        Suppliers["Suppliers"]
        SupplierItems["Supplier Items"]
        Discounts["Bulk Discounts"]
        POs["Purchase Orders"]
        POLines["PO Line Items"]
    end
    
    subgraph Production["Production"]
        Composition["Product Composition"]
        JOs["Job Orders"]
        JOIngredients["JO Ingredients"]
    end
    
    subgraph Support["Support Tables"]
        Users["Users"]
        Audit["Audit Logs"]
        Settings["System Settings"]
        Nutrition["Item Nutrition"]
        Allergens["Item Allergens"]
    end
    
    Items --> Batches
    Items --> Movements
    Batches --> Transactions
    Movements --> Transactions
    
    Suppliers --> SupplierItems
    Suppliers --> Discounts
    Suppliers --> POs
    SupplierItems --> Items
    POs --> POLines
    POLines --> Items
    
    Items --> Composition
    Composition --> Items
    Items --> JOs
    JOs --> JOIngredients
    JOIngredients --> Items
    
    Users --> Audit
    Items --> Nutrition
    Items --> Allergens
    
    style Core fill:#c8e6c9
    style Procurement fill:#bbdefb
    style Production fill:#ffe0b2
    style Support fill:#f8bbd0
```

---

## 3. Request-Response Flow

```mermaid
sequenceDiagram
    participant User as User/Frontend
    participant API as API Server
    participant Auth as Auth Service
    participant DB as Database
    participant Cache as Redis Cache
    participant Jobs as Background Jobs
    participant WS as WebSocket
    
    User->>API: 1. POST /auth/login
    API->>Auth: Validate credentials
    Auth->>DB: Query user
    DB-->>Auth: User data
    Auth-->>API: JWT Token
    API-->>User: Token + Refresh Token
    
    Note over User: User authenticated
    
    User->>API: 2. GET /items (with JWT)
    API->>Cache: Check cache
    alt Cache Hit
        Cache-->>API: Items data
    else Cache Miss
        API->>DB: Query items
        DB-->>API: Items data
        API->>Cache: Store in cache
    end
    API-->>User: Items list
    
    User->>API: 3. POST /purchase-orders
    API->>DB: Create PO
    DB-->>API: PO created
    API->>Jobs: Trigger PO notification job
    Jobs->>WS: Broadcast PO created event
    WS-->>User: Real-time notification
    API-->>User: PO confirmation
    
    Note over Jobs: Background processing
    Jobs->>DB: Update PO status
    Jobs->>WS: Broadcast status update
    WS-->>User: Real-time update
    
    User->>API: 4. POST /purchase-orders/:id/receive
    API->>DB: Begin transaction
    API->>DB: Update PO status
    API->>DB: Update item stock
    API->>DB: Create stock movement
    API->>DB: Commit transaction
    DB-->>API: Success
    API->>Cache: Invalidate item cache
    API->>Jobs: Trigger stock alert job
    Jobs->>WS: Broadcast stock update
    WS-->>User: Real-time alert
    API-->>User: Receipt confirmed
```

---

## 4. Data Flow - Purchase Order to Inventory Update

```mermaid
graph TD
    A["Create Purchase Order"] -->|Select Supplier| B["Choose Items & Quantities"]
    B -->|Set Pricing| C["Calculate Total"]
    C -->|Submit| D["PO Created in DB"]
    
    D -->|Status: Pending| E["Waiting for Delivery"]
    E -->|Delivery Received| F["Record Receipt"]
    
    F -->|Validate Items| G["Quality Check"]
    G -->|All Passed| H["Create FIFO Batches"]
    
    H -->|Update Stock| I["Increment Item Stock"]
    I -->|Log Movement| J["Create Stock Movement Record"]
    
    J -->|Trigger| K["Check Stock Levels"]
    K -->|Below Min?| L["Generate Alert"]
    K -->|Above Max?| M["Flag Surplus"]
    
    L -->|Notify| N["Real-time Alert to User"]
    M -->|Notify| N
    
    J -->|Update Cache| O["Invalidate Redis Cache"]
    O -->|Refresh| P["Frontend Updates Display"]
    
    style A fill:#e3f2fd
    style D fill:#c8e6c9
    style H fill:#fff9c4
    style J fill:#f8bbd0
    style N fill:#ffccbc
    style P fill:#c8e6c9
```

---

## 5. Data Flow - Job Order Production

```mermaid
graph TD
    A["Create Job Order"] -->|Select Product| B["Get Recipe/Composition"]
    B -->|Calculate Ingredients| C["Determine Quantities Needed"]
    C -->|Check Availability| D["Verify Stock Levels"]
    
    D -->|Sufficient Stock| E["JO Status: Draft"]
    D -->|Insufficient Stock| F["Alert: Shortage"]
    
    E -->|Start Production| G["JO Status: In Progress"]
    G -->|Deduct Ingredients| H["FIFO Batch Consumption"]
    
    H -->|Update Item Stock| I["Decrement Ingredient Quantities"]
    I -->|Create Movement| J["Log Production Consumption"]
    
    J -->|Record Batch Usage| K["Update Batch Quantities"]
    K -->|Mark Batches| L["Track Expiry & FIFO"]
    
    G -->|Production Complete| M["JO Status: Completed"]
    M -->|Add Finished Product| N["Increment Product Stock"]
    
    N -->|Create Movement| O["Log Production Receipt"]
    O -->|Update Cache| P["Invalidate Redis"]
    P -->|Notify| Q["Real-time Update to Dashboard"]
    
    style A fill:#e3f2fd
    style E fill:#c8e6c9
    style G fill:#fff9c4
    style H fill:#ffccbc
    style M fill:#c8e6c9
    style Q fill:#c8e6c9
```

---

## 6. Inventory Tracking - FIFO Batch Management

```mermaid
graph LR
    subgraph Incoming["Incoming Stock"]
        PO1["PO-001<br/>100 units<br/>2024-01-10"]
        PO2["PO-002<br/>150 units<br/>2024-01-15"]
        PO3["PO-003<br/>200 units<br/>2024-01-20"]
    end
    
    subgraph Batches["FIFO Batches"]
        B1["Batch 1<br/>100 units<br/>Exp: 2025-01-10"]
        B2["Batch 2<br/>150 units<br/>Exp: 2025-01-15"]
        B3["Batch 3<br/>200 units<br/>Exp: 2025-01-20"]
    end
    
    subgraph Consumption["Consumption"]
        JO1["JO-001<br/>Needs 80 units"]
        JO2["JO-002<br/>Needs 100 units"]
        JO3["JO-003<br/>Needs 50 units"]
    end
    
    subgraph Remaining["Remaining Stock"]
        R1["Batch 1<br/>20 units"]
        R2["Batch 2<br/>150 units"]
        R3["Batch 3<br/>200 units"]
    end
    
    PO1 --> B1
    PO2 --> B2
    PO3 --> B3
    
    JO1 -->|Consumes| B1
    JO2 -->|Consumes| R1
    JO2 -->|Consumes| B2
    JO3 -->|Consumes| R2
    
    B1 --> R1
    B2 --> R2
    B3 --> R3
    
    style B1 fill:#fff9c4
    style B2 fill:#fff9c4
    style B3 fill:#fff9c4
    style R1 fill:#c8e6c9
    style R2 fill:#c8e6c9
    style R3 fill:#c8e6c9
```

---

## 7. Alert & Notification System

```mermaid
graph TD
    subgraph Triggers["Alert Triggers"]
        T1["Low Stock<br/>Below Min Threshold"]
        T2["High Stock<br/>Above Max Capacity"]
        T3["Expiring Items<br/>< 7 days"]
        T4["Supplier Issue<br/>Quality/Delivery"]
        T5["PO Status<br/>Pending > 5 days"]
    end
    
    subgraph Processing["Alert Processing"]
        P1["Check Condition"]
        P2["Calculate Severity"]
        P3["Determine Recipients"]
        P4["Format Message"]
    end
    
    subgraph Channels["Notification Channels"]
        C1["In-App Notification"]
        C2["Email"]
        C3["SMS"]
        C4["Dashboard Alert"]
    end
    
    subgraph Storage["Storage & Logging"]
        S1["Database Record"]
        S2["Audit Log"]
        S3["Alert History"]
    end
    
    T1 --> P1
    T2 --> P1
    T3 --> P1
    T4 --> P1
    T5 --> P1
    
    P1 --> P2
    P2 --> P3
    P3 --> P4
    
    P4 --> C1
    P4 --> C2
    P4 --> C3
    P4 --> C4
    
    C1 --> S1
    C2 --> S2
    C3 --> S3
    C4 --> S1
    
    style T1 fill:#ffccbc
    style T2 fill:#ffccbc
    style T3 fill:#ffccbc
    style T4 fill:#ffccbc
    style T5 fill:#ffccbc
    style C1 fill:#c8e6c9
    style C2 fill:#c8e6c9
    style C3 fill:#c8e6c9
    style C4 fill:#c8e6c9
```

---

## 8. User Authentication & Authorization Flow

```mermaid
graph TD
    A["User Visits App"] --> B["Check Local Storage<br/>for JWT"]
    
    B -->|Token Exists| C["Validate Token<br/>Expiry"]
    B -->|No Token| D["Redirect to Login"]
    
    C -->|Valid| E["Decode JWT<br/>Get User Info"]
    C -->|Expired| F["Use Refresh Token"]
    
    F -->|Refresh Valid| G["Get New JWT"]
    F -->|Refresh Expired| D
    
    D --> H["User Enters Credentials"]
    H --> I["POST /auth/login"]
    I --> J["Backend Validates"]
    
    J -->|Valid| K["Generate JWT<br/>& Refresh Token"]
    J -->|Invalid| L["Return Error"]
    
    K --> M["Store Tokens<br/>in localStorage"]
    M --> N["Add JWT to Headers"]
    
    E --> N
    G --> N
    
    N --> O["Make API Request"]
    O --> P["Backend Validates JWT"]
    
    P -->|Valid| Q["Check User Role<br/>& Permissions"]
    P -->|Invalid| R["Return 401 Unauthorized"]
    
    Q -->|Authorized| S["Process Request"]
    Q -->|Not Authorized| T["Return 403 Forbidden"]
    
    S --> U["Return Response"]
    U --> V["Update UI"]
    
    style A fill:#e3f2fd
    style D fill:#ffccbc
    style K fill:#c8e6c9
    style V fill:#c8e6c9
    style R fill:#ffccbc
    style T fill:#ffccbc
```

---

## 9. Deployment Architecture

```mermaid
graph TB
    subgraph Client["Client Tier"]
        CDN["CDN<br/>Static Assets"]
        Web["React App<br/>Distributed"]
    end
    
    subgraph LB["Load Balancing"]
        ALB["Application<br/>Load Balancer"]
    end
    
    subgraph API["API Tier"]
        API1["API Server 1"]
        API2["API Server 2"]
        API3["API Server 3"]
    end
    
    subgraph Cache["Caching Tier"]
        Redis["Redis Cluster<br/>Session & Data Cache"]
    end
    
    subgraph DB["Database Tier"]
        Master["MySQL Master"]
        Slave1["MySQL Slave 1"]
        Slave2["MySQL Slave 2"]
    end
    
    subgraph Background["Background Processing"]
        Queue["Job Queue<br/>Bull/Agenda"]
        Worker1["Worker 1"]
        Worker2["Worker 2"]
    end
    
    subgraph Storage["Storage"]
        S3["AWS S3<br/>File Storage"]
        Logs["CloudWatch Logs<br/>Monitoring"]
    end
    
    Web --> CDN
    Web --> ALB
    
    ALB --> API1
    ALB --> API2
    ALB --> API3
    
    API1 --> Redis
    API2 --> Redis
    API3 --> Redis
    
    API1 --> Master
    API2 --> Master
    API3 --> Master
    
    Master --> Slave1
    Master --> Slave2
    
    API1 --> Queue
    API2 --> Queue
    API3 --> Queue
    
    Queue --> Worker1
    Queue --> Worker2
    
    Worker1 --> Master
    Worker2 --> Master
    
    API1 --> S3
    API2 --> S3
    API3 --> S3
    
    API1 --> Logs
    API2 --> Logs
    API3 --> Logs
    
    style Client fill:#e3f2fd
    style LB fill:#fff3e0
    style API fill:#f3e5f5
    style Cache fill:#e8f5e9
    style DB fill:#fce4ec
    style Background fill:#fff9c4
    style Storage fill:#c8e6c9
```

---

## 10. Frontend Component Architecture

```mermaid
graph TD
    App["App.jsx<br/>Main Router"]
    
    App --> Layout["Layout.jsx<br/>Navigation & Sidebar"]
    
    Layout --> Dashboard["Dashboard Page"]
    Layout --> Items["Items Page"]
    Layout --> Suppliers["Suppliers Page"]
    Layout --> POs["Purchase Orders Page"]
    Layout --> JOs["Job Orders Page"]
    Layout --> Movements["Stock Movements Page"]
    Layout --> Reports["Reports Page"]
    Layout --> Settings["Settings Page"]
    
    Dashboard --> DashComponents["Dashboard Components<br/>StatsCard, LowStockList<br/>RecentMovements, AlertBanner"]
    
    Items --> ItemComponents["Item Components<br/>ItemCard, ItemFormModal<br/>ItemDetailsModal, FIFOBatchViewer"]
    
    Suppliers --> SupplierComponents["Supplier Components<br/>SupplierCard, SupplierFormModal<br/>SupplierDetailsModal"]
    
    POs --> POComponents["PO Components<br/>POCreateWizard, PODetailsModal<br/>POReceiptModal"]
    
    JOs --> JOComponents["JO Components<br/>JOCreateModal, JODetailsModal"]
    
    Movements --> MovementComponents["Movement Components<br/>MovementCreateModal"]
    
    Reports --> ReportComponents["Report Components<br/>Charts, Tables, Filters"]
    
    DashComponents --> UIComponents["Reusable UI Components<br/>Button, Input, Select<br/>Dialog, Card, Badge<br/>Tabs, Checkbox, Switch"]
    ItemComponents --> UIComponents
    SupplierComponents --> UIComponents
    POComponents --> UIComponents
    JOComponents --> UIComponents
    MovementComponents --> UIComponents
    ReportComponents --> UIComponents
    
    UIComponents --> Utils["Utility Functions<br/>formatters, validators<br/>calculations, FIFO logic"]
    
    Utils --> API["API Service Layer<br/>Axios/Fetch Wrapper"]
    
    API --> Store["State Management<br/>Redux/Zustand"]
    
    Store --> Cache["Local Cache<br/>localStorage"]
    
    style App fill:#e3f2fd
    style Layout fill:#e3f2fd
    style UIComponents fill:#c8e6c9
    style API fill:#fff3e0
    style Store fill:#f3e5f5
```

---

## 11. Error Handling & Recovery Flow

```mermaid
graph TD
    A["API Request"] --> B["Check Network"]
    
    B -->|No Network| C["Store in Queue"]
    C --> D["Show Offline Message"]
    D --> E["Retry When Online"]
    
    B -->|Network OK| F["Send Request"]
    F --> G["Receive Response"]
    
    G -->|Success| H["Process Data"]
    H --> I["Update UI"]
    
    G -->|Error| J["Check Status Code"]
    
    J -->|401 Unauthorized| K["Refresh Token"]
    K -->|Success| L["Retry Request"]
    K -->|Failure| M["Redirect to Login"]
    
    J -->|403 Forbidden| N["Show Permission Error"]
    
    J -->|404 Not Found| O["Show Not Found Error"]
    
    J -->|422 Validation| P["Show Field Errors"]
    
    J -->|500 Server Error| Q["Retry with Backoff"]
    Q -->|Max Retries| R["Show Server Error"]
    Q -->|Success| H
    
    J -->|Network Timeout| S["Retry with Backoff"]
    S -->|Max Retries| T["Show Timeout Error"]
    S -->|Success| H
    
    N --> U["Log to Backend"]
    O --> U
    P --> U
    R --> U
    T --> U
    
    style A fill:#e3f2fd
    style I fill:#c8e6c9
    style M fill:#ffccbc
    style N fill:#ffccbc
    style O fill:#ffccbc
    style R fill:#ffccbc
    style T fill:#ffccbc
```

---

## 12. Scalability & Performance Optimization

```mermaid
graph LR
    subgraph Optimization["Performance Optimization"]
        O1["Database Indexing<br/>Query Optimization"]
        O2["Redis Caching<br/>Session Management"]
        O3["API Response<br/>Compression"]
        O4["Frontend Code<br/>Splitting"]
        O5["CDN for<br/>Static Assets"]
    end
    
    subgraph Monitoring["Monitoring & Metrics"]
        M1["Application<br/>Performance"]
        M2["Database<br/>Performance"]
        M3["API<br/>Response Times"]
        M4["Error<br/>Rates"]
        M5["User<br/>Analytics"]
    end
    
    subgraph Scaling["Horizontal Scaling"]
        S1["Load Balancer<br/>Multiple API Servers"]
        S2["Database<br/>Replication"]
        S3["Cache<br/>Cluster"]
        S4["Background Job<br/>Workers"]
    end
    
    O1 --> M1
    O2 --> M2
    O3 --> M3
    O4 --> M4
    O5 --> M5
    
    M1 --> S1
    M2 --> S2
    M3 --> S3
    M4 --> S4
    M5 --> S1
    
    style Optimization fill:#e3f2fd
    style Monitoring fill:#fff3e0
    style Scaling fill:#f3e5f5
```

---

## 13. Security Layers

```mermaid
graph TD
    subgraph Transport["Transport Security"]
        T1["HTTPS/TLS<br/>Encryption"]
        T2["Certificate<br/>Management"]
    end
    
    subgraph Application["Application Security"]
        A1["JWT<br/>Authentication"]
        A2["RBAC<br/>Authorization"]
        A3["CORS<br/>Policy"]
        A4["CSRF<br/>Protection"]
    end
    
    subgraph Data["Data Security"]
        D1["Password<br/>Hashing"]
        D2["Data<br/>Encryption"]
        D3["SQL Injection<br/>Prevention"]
        D4["XSS<br/>Prevention"]
    end
    
    subgraph Monitoring["Security Monitoring"]
        M1["Audit<br/>Logging"]
        M2["Intrusion<br/>Detection"]
        M3["Rate<br/>Limiting"]
        M4["DDoS<br/>Protection"]
    end
    
    T1 --> A1
    T2 --> A1
    
    A1 --> D1
    A2 --> D2
    A3 --> D3
    A4 --> D4
    
    D1 --> M1
    D2 --> M2
    D3 --> M3
    D4 --> M4
    
    style Transport fill:#e3f2fd
    style Application fill:#fff3e0
    style Data fill:#f3e5f5
    style Monitoring fill:#fce4ec
```

