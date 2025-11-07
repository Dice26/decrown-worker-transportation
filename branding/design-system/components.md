# DeCrown Transportation - UI Components

## 🧩 Component Library

### Navigation Components

#### Header Navigation
```html
<header class="header">
  <div class="header__container">
    <div class="header__logo">
      <img src="/logos/decrown-horizontal.svg" alt="DeCrown Transportation" />
    </div>
    <nav class="header__nav">
      <a href="/dashboard" class="nav-link nav-link--active">Dashboard</a>
      <a href="/transport" class="nav-link">Transportation</a>
      <a href="/workers" class="nav-link">Workers</a>
      <a href="/reports" class="nav-link">Reports</a>
    </nav>
    <div class="header__actions">
      <button class="btn btn--secondary btn--sm">Settings</button>
      <div class="user-menu">
        <img src="/avatar.jpg" alt="User" class="avatar avatar--sm" />
      </div>
    </div>
  </div>
</header>
```

#### Mobile Bottom Navigation
```html
<nav class="bottom-nav">
  <a href="/dashboard" class="bottom-nav__item bottom-nav__item--active">
    <icon name="home" size="24" />
    <span>Home</span>
  </a>
  <a href="/transport" class="bottom-nav__item">
    <icon name="car" size="24" />
    <span>Transport</span>
  </a>
  <a href="/workers" class="bottom-nav__item">
    <icon name="users" size="24" />
    <span>Workers</span>
  </a>
  <a href="/profile" class="bottom-nav__item">
    <icon name="user" size="24" />
    <span>Profile</span>
  </a>
</nav>
```

### Button Components

#### Button Variants
```html
<!-- Primary Button -->
<button class="btn btn--primary">
  <icon name="plus" size="16" />
  Add Worker
</button>

<!-- Secondary Button -->
<button class="btn btn--secondary">
  Cancel
</button>

<!-- Danger Button -->
<button class="btn btn--danger">
  <icon name="trash" size="16" />
  Delete
</button>

<!-- Ghost Button -->
<button class="btn btn--ghost">
  Learn More
</button>

<!-- Icon Button -->
<button class="btn btn--icon" aria-label="Edit">
  <icon name="edit" size="20" />
</button>
```

#### Button Sizes
```html
<button class="btn btn--primary btn--xs">Extra Small</button>
<button class="btn btn--primary btn--sm">Small</button>
<button class="btn btn--primary">Default</button>
<button class="btn btn--primary btn--lg">Large</button>
<button class="btn btn--primary btn--xl">Extra Large</button>
```

### Form Components

#### Input Fields
```html
<div class="form-group">
  <label class="form-label" for="worker-name">Worker Name</label>
  <input 
    type="text" 
    id="worker-name" 
    class="form-input" 
    placeholder="Enter worker name"
    required
  />
  <div class="form-help">Enter the full name of the worker</div>
</div>

<!-- Input with Icon -->
<div class="form-group">
  <label class="form-label" for="phone">Phone Number</label>
  <div class="input-group">
    <div class="input-group__prepend">
      <icon name="phone" size="20" />
    </div>
    <input 
      type="tel" 
      id="phone" 
      class="form-input" 
      placeholder="+1 (555) 123-4567"
    />
  </div>
</div>
```

#### Select Dropdown
```html
<div class="form-group">
  <label class="form-label" for="worker-role">Worker Role</label>
  <select id="worker-role" class="form-select">
    <option value="">Select a role</option>
    <option value="construction">Construction Worker</option>
    <option value="maintenance">Maintenance Worker</option>
    <option value="supervisor">Supervisor</option>
  </select>
</div>
```

#### Checkbox and Radio
```html
<!-- Checkbox -->
<div class="form-check">
  <input type="checkbox" id="notifications" class="form-check-input" />
  <label class="form-check-label" for="notifications">
    Enable push notifications
  </label>
</div>

<!-- Radio Group -->
<div class="form-group">
  <fieldset class="form-fieldset">
    <legend class="form-legend">Transportation Method</legend>
    <div class="form-check">
      <input type="radio" id="bus" name="transport" value="bus" class="form-check-input" />
      <label class="form-check-label" for="bus">Company Bus</label>
    </div>
    <div class="form-check">
      <input type="radio" id="van" name="transport" value="van" class="form-check-input" />
      <label class="form-check-label" for="van">Company Van</label>
    </div>
  </fieldset>
</div>
```

### Card Components

#### Basic Card
```html
<div class="card">
  <div class="card__header">
    <h3 class="card__title">Worker Information</h3>
    <div class="card__actions">
      <button class="btn btn--ghost btn--sm">Edit</button>
    </div>
  </div>
  <div class="card__content">
    <p class="card__text">John Doe - Construction Worker</p>
    <p class="card__meta">Last active: 2 hours ago</p>
  </div>
</div>
```

#### Status Card
```html
<div class="card card--status">
  <div class="card__content">
    <div class="status-indicator status-indicator--success">
      <icon name="check-circle" size="20" />
    </div>
    <div class="card__info">
      <h4 class="card__title">Transportation Active</h4>
      <p class="card__text">15 workers currently in transit</p>
    </div>
  </div>
</div>
```

#### Metric Card
```html
<div class="card card--metric">
  <div class="card__content">
    <div class="metric">
      <div class="metric__value">247</div>
      <div class="metric__label">Active Workers</div>
      <div class="metric__change metric__change--positive">
        <icon name="trending-up" size="16" />
        +12% from last month
      </div>
    </div>
  </div>
</div>
```

### Table Components

#### Data Table
```html
<div class="table-container">
  <table class="table">
    <thead class="table__head">
      <tr>
        <th class="table__header">Worker Name</th>
        <th class="table__header">Role</th>
        <th class="table__header">Status</th>
        <th class="table__header">Location</th>
        <th class="table__header">Actions</th>
      </tr>
    </thead>
    <tbody class="table__body">
      <tr class="table__row">
        <td class="table__cell">
          <div class="user-info">
            <img src="/avatar1.jpg" alt="John Doe" class="avatar avatar--sm" />
            <span>John Doe</span>
          </div>
        </td>
        <td class="table__cell">Construction Worker</td>
        <td class="table__cell">
          <span class="badge badge--success">Active</span>
        </td>
        <td class="table__cell">Downtown Site</td>
        <td class="table__cell">
          <div class="table__actions">
            <button class="btn btn--ghost btn--sm">View</button>
            <button class="btn btn--ghost btn--sm">Edit</button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Status Components

#### Badges
```html
<span class="badge badge--success">Active</span>
<span class="badge badge--warning">Pending</span>
<span class="badge badge--danger">Inactive</span>
<span class="badge badge--info">In Transit</span>
<span class="badge badge--neutral">Scheduled</span>
```

#### Status Indicators
```html
<div class="status-indicator status-indicator--success">
  <icon name="check-circle" size="16" />
  <span>Online</span>
</div>

<div class="status-indicator status-indicator--warning">
  <icon name="clock" size="16" />
  <span>Pending</span>
</div>

<div class="status-indicator status-indicator--danger">
  <icon name="x-circle" size="16" />
  <span>Offline</span>
</div>
```

### Modal Components

#### Basic Modal
```html
<div class="modal modal--active" id="worker-modal">
  <div class="modal__backdrop"></div>
  <div class="modal__container">
    <div class="modal__header">
      <h2 class="modal__title">Add New Worker</h2>
      <button class="modal__close" aria-label="Close modal">
        <icon name="x" size="24" />
      </button>
    </div>
    <div class="modal__content">
      <form class="form">
        <div class="form-group">
          <label class="form-label" for="modal-name">Full Name</label>
          <input type="text" id="modal-name" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="modal-role">Role</label>
          <select id="modal-role" class="form-select">
            <option value="">Select role</option>
            <option value="worker">Worker</option>
            <option value="supervisor">Supervisor</option>
          </select>
        </div>
      </form>
    </div>
    <div class="modal__footer">
      <button class="btn btn--secondary">Cancel</button>
      <button class="btn btn--primary">Add Worker</button>
    </div>
  </div>
</div>
```

### Loading Components

#### Loading Spinner
```html
<div class="loading-spinner">
  <div class="spinner"></div>
  <span class="loading-text">Loading workers...</span>
</div>
```

#### Skeleton Loader
```html
<div class="skeleton-card">
  <div class="skeleton skeleton--avatar"></div>
  <div class="skeleton skeleton--text skeleton--text-lg"></div>
  <div class="skeleton skeleton--text"></div>
  <div class="skeleton skeleton--text skeleton--text-sm"></div>
</div>
```

#### Progress Bar
```html
<div class="progress">
  <div class="progress__bar" style="width: 65%"></div>
  <span class="progress__text">65% Complete</span>
</div>
```

### Alert Components

#### Alert Messages
```html
<div class="alert alert--success">
  <icon name="check-circle" size="20" />
  <div class="alert__content">
    <h4 class="alert__title">Success!</h4>
    <p class="alert__message">Worker has been added successfully.</p>
  </div>
  <button class="alert__close">
    <icon name="x" size="16" />
  </button>
</div>

<div class="alert alert--warning">
  <icon name="alert-triangle" size="20" />
  <div class="alert__content">
    <h4 class="alert__title">Warning</h4>
    <p class="alert__message">Some workers are not checked in yet.</p>
  </div>
</div>

<div class="alert alert--danger">
  <icon name="x-circle" size="20" />
  <div class="alert__content">
    <h4 class="alert__title">Error</h4>
    <p class="alert__message">Failed to update worker information.</p>
  </div>
</div>
```

### Map Components

#### Location Map
```html
<div class="map-container">
  <div class="map" id="worker-locations-map">
    <!-- Map implementation -->
  </div>
  <div class="map__controls">
    <button class="btn btn--secondary btn--sm">
      <icon name="refresh" size="16" />
      Refresh
    </button>
    <button class="btn btn--secondary btn--sm">
      <icon name="maximize" size="16" />
      Fullscreen
    </button>
  </div>
  <div class="map__legend">
    <div class="legend-item">
      <div class="legend-color legend-color--success"></div>
      <span>Active Workers</span>
    </div>
    <div class="legend-item">
      <div class="legend-color legend-color--warning"></div>
      <span>In Transit</span>
    </div>
  </div>
</div>
```

### Timeline Components

#### Activity Timeline
```html
<div class="timeline">
  <div class="timeline__item">
    <div class="timeline__marker timeline__marker--success">
      <icon name="check" size="16" />
    </div>
    <div class="timeline__content">
      <h4 class="timeline__title">Worker Check-in</h4>
      <p class="timeline__description">John Doe checked in at Downtown Site</p>
      <time class="timeline__time">2 hours ago</time>
    </div>
  </div>
  <div class="timeline__item">
    <div class="timeline__marker timeline__marker--info">
      <icon name="car" size="16" />
    </div>
    <div class="timeline__content">
      <h4 class="timeline__title">Transportation Started</h4>
      <p class="timeline__description">Bus #247 departed from Central Hub</p>
      <time class="timeline__time">3 hours ago</time>
    </div>
  </div>
</div>
```

## 🎨 Component CSS Framework

### Base Styles
```css
/* Reset and base styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-primary);
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  color: var(--color-text-primary);
  background-color: var(--color-bg-light);
}

/* Utility classes */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }

.mb-0 { margin-bottom: 0; }
.mb-1 { margin-bottom: var(--spacing-xs); }
.mb-2 { margin-bottom: var(--spacing-sm); }
.mb-3 { margin-bottom: var(--spacing-md); }
.mb-4 { margin-bottom: var(--spacing-lg); }
```

---

**Component Usage**: Each component includes accessibility features, responsive design, and follows the established design system patterns for consistent user experiences.