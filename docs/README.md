# SKU Inventory Manager - Documentation

Welcome to the SKU Inventory Manager documentation. This directory contains the complete technical documentation for the project.

## Documentation Principles

**Core Principle**: Documentation in `/docs` is the **single source of truth** and takes precedence over code. If code doesn't match documentation, the documentation is correct (unless explicitly stated otherwise).

### Key Principles

1. **Source of Truth**: `/docs` is authoritative - code must align with documentation
2. **Update Together**: Code changes require documentation updates in the same PR
3. **Structure**: Follow the established folder hierarchy
4. **Cross-References**: Use relative links between documents
5. **Versioning**: Keep documentation in sync with codebase

For detailed guidelines on when and how to create documentation, see [Documentation Guidelines](../.cursor/rules/documentation-guidelines.mdc).

---

## Documentation Structure

```
/docs
├── README.md                    # This file - documentation index
├── architecture/                 # System architecture & diagrams
│   └── system-architecture.md   # Complete system architecture with 13 diagrams
├── database/                     # Database schema & design
│   └── schema.md                # Complete database schema, ERD, tables, migrations
├── api/                         # API specifications & integration
│   ├── specification.md         # Complete API specification with all endpoints
│   └── integration-guide.md    # Frontend-backend integration patterns
└── development/                 # Development guides & roadmaps
    ├── roadmap.md               # Development phases, tasks, deliverables
    ├── guidelines.md            # Coding standards, testing, security checklists
    └── environment-setup.md     # Setup instructions, prerequisites, configuration
```

---

## Quick Navigation

### Architecture & Design

- **[System Architecture](./architecture/system-architecture.md)**
  - High-level system architecture
  - Database architecture
  - Request-response flows
  - Data flows (PO, JO)
  - FIFO batch management
  - Alert & notification system
  - Authentication & authorization
  - Deployment architecture
  - Frontend component architecture
  - Error handling & recovery
  - Scalability & performance
  - Security layers

### Database

- **[Database Schema](./database/schema.md)**
  - Entity-relationship diagram
  - Complete table definitions
  - Indexes & performance optimization
  - Data integrity constraints
  - Migration strategy
  - Initial data setup

### API

- **[API Specification](./api/specification.md)**
  - Authentication endpoints
  - Items (SKU Master) endpoints
  - Suppliers endpoints
  - Purchase Orders endpoints
  - Job Orders endpoints
  - Stock Movements endpoints
  - Reports endpoints
  - Response formats
  - Error handling
  - Rate limiting

- **[Integration Guide](./api/integration-guide.md)**
  - API service layer setup
  - State management (Zustand)
  - Custom hooks for data fetching
  - WebSocket real-time updates
  - Error handling & retry logic
  - Component integration examples
  - Performance optimization

### Development

- **[Development Roadmap](./development/roadmap.md)**
  - Technology stack
  - Development phases (6 phases, 17+ weeks)
  - Tasks & deliverables
  - Future enhancements
  - Success metrics

- **[Development Guidelines](./development/guidelines.md)**
  - API development guidelines
  - Database migration strategy
  - Testing strategy
  - Code quality standards
  - Performance optimization checklist
  - Security checklist
  - Monitoring & logging
  - Deployment checklist

- **[Environment Setup](./development/environment-setup.md)**
  - Prerequisites
  - Local development setup
  - Environment variables
  - Database setup
  - Redis setup
  - Docker setup
  - Troubleshooting

---

## Getting Started

### For New Developers

1. **Start Here**: Read [Environment Setup](./development/environment-setup.md)
2. **Understand the System**: Review [System Architecture](./architecture/system-architecture.md)
3. **Learn the Database**: Study [Database Schema](./database/schema.md)
4. **API Reference**: Check [API Specification](./api/specification.md)
5. **Development Process**: Follow [Development Guidelines](./development/guidelines.md)

### For Frontend Developers

1. [Environment Setup](./development/environment-setup.md) - Get your dev environment running
2. [Integration Guide](./api/integration-guide.md) - Learn how to integrate with the backend
3. [API Specification](./api/specification.md) - Reference for all API endpoints
4. [System Architecture](./architecture/system-architecture.md) - Understand the overall system

### For Backend Developers

1. [Environment Setup](./development/environment-setup.md) - Set up backend environment
2. [Database Schema](./database/schema.md) - Understand the data model
3. [API Specification](./api/specification.md) - Implement API endpoints
4. [Development Guidelines](./development/guidelines.md) - Follow coding standards
5. [System Architecture](./architecture/system-architecture.md) - Understand system design

### For Architects & Tech Leads

1. [System Architecture](./architecture/system-architecture.md) - Complete system design
2. [Development Roadmap](./development/roadmap.md) - Project phases & timeline
3. [Development Guidelines](./development/guidelines.md) - Standards & best practices
4. [Database Schema](./database/schema.md) - Data architecture

---

## Documentation Maintenance

### Updating Documentation

When making code changes:

1. **Update Together**: Documentation must be updated in the same PR as code changes
2. **Check Cross-References**: Update links if files are moved or renamed
3. **Verify Examples**: Ensure code examples are current and accurate
4. **Update Diagrams**: Modify architecture diagrams if system structure changes

### PR Checklist

- [ ] Documentation updated in same PR
- [ ] Cross-references updated
- [ ] Examples updated if applicable
- [ ] Diagrams updated if architecture changed
- [ ] README links verified

### Reporting Issues

If you find documentation that is:
- **Outdated**: Create an issue or PR to update it
- **Missing**: Follow [Documentation Guidelines](../.cursor/rules/documentation-guidelines.mdc) to create it
- **Incorrect**: Update it in a PR with the fix

---

## Related Resources

- **Project Rules**: See `.cursor/rules/` for project-specific rules
- **Documentation Guidelines**: [.cursor/rules/documentation-guidelines.mdc](../.cursor/rules/documentation-guidelines.mdc)
- **GitHub Repository**: [Project Repository](https://github.com/your-org/sku-inventory-manager)
- **Issue Tracker**: [GitHub Issues](https://github.com/your-org/sku-inventory-manager/issues)

---

## Last Updated

Documentation is maintained continuously. For the most current information, check the git history or file modification dates.

---

## Questions?

- **Technical Questions**: Create a GitHub Discussion
- **Documentation Issues**: Create a GitHub Issue
- **Feature Requests**: See [Development Roadmap](./development/roadmap.md)

