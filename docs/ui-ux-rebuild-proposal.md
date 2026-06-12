# 📐 Đề xuất Rebuild UI/UX - LogiVN Platform

**Ngày phân tích:** 11/06/2026
**Phạm vi:** Landing Page + Dashboard + Design System
**Mục tiêu:** Xây dựng lại UI/UX sạch sẽ, nhất quán, scalable và dễ bảo trì

---

## 📊 TÓM TẮT EXECUTIVE

### Hiện trạng
- **Landing Page**: Monolith component 3700+ lines, hardcoded content
- **Dashboard**: Responsive navigation phức tạp, 3 hệ thống nav song song
- **Design System**: 100+ CSS variables, không có design tokens, inconsistent patterns
- **UI Components**: Chỉ 3 base components, thiếu component library đầy đủ
- **Styling**: Mix CSS variables + Tailwind v4, 4 theme contexts chồng chéo

### Vấn đề chính
1. ❌ **Scalability**: Landing page không tách được, khó maintain
2. ❌ **Consistency**: Mỗi feature tự implement UI, không có single source of truth
3. ❌ **Developer Experience**: Thiếu documentation, no Storybook, hard to onboard
4. ❌ **Performance**: Mega components, no code splitting cho dashboard features
5. ❌ **Dark Mode**: Có script nhưng không hoạt động, theme luôn là light

### Đề xuất
Rebuild toàn bộ với **3-phase approach**:
- **Phase 1**: Design System Foundation (4 tuần)
- **Phase 2**: Component Library (6 tuần)
- **Phase 3**: Page Rebuild (8 tuần)

---

## 🎨 I. PHÂN TÍCH DESIGN SYSTEM HIỆN TẠI

### A. CSS Variables Architecture

#### Vấn đề: 4 Theme Contexts chồng chéo

```css
.stitch-landing   { /* Marketing/Landing */  }
.stitch-onboarding{ /* User onboarding    */  }
.stitch-admin     { /* Dashboard/Admin    */  }
.stitch-customer  { /* Customer ordering  */  }
```

**Đánh giá:**
- ✅ **Tốt**: Phân tách contexts rõ ràng
- ❌ **Xấu**: Nhiều overlapping values (primary, accent, surface...)
- ❌ **Xấu**: Dark mode defined nhưng luôn override về light
- ❌ **Xấu**: Không có single source of truth → Khó sync design

#### Color Palette Audit

**Brand Colors (Good ✅)**:
```css
--brand-primary: #0F4D3A    /* Jade Green  */
--brand-secondary: #A9C5A1  /* Soft Sage   */
--brand-accent: #F28C28     /* Lacquer Orange */
--brand-background: #FFF7EB /* Warm Cream  */
```

**Semantic Colors (Mixed ⚠️)**:

- `--primary`, `--secondary`, `--accent`: Well-defined
- `--success`, `--warning`, `--danger`: Inconsistent (danger = accent trong nhiều context)
- `--surface`, `--surface-strong`, `--surface-container`: Too many variants, unclear usage

**Typography Scale (Excellent ✅)**:
```css
.stitch-admin {
  --admin-text-xs: 0.75rem;
  --admin-text-sm: 0.875rem;
  --admin-text-base: 0.9375rem;  /* 15px */
  --admin-text-lg: 1.0625rem;     /* 17px */
  --admin-text-xl: 1.25rem;
  --admin-text-2xl: 1.5rem;
}
```
- ✅ Responsive scaling (mobile smaller)
- ✅ Harmonious increments

### B. Component Architecture Issues

**Chỉ 3 Base Components**:
1. `Button` (4 variants: primary, secondary, ghost, danger)
2. `Badge` (5 tones: neutral, green, yellow, blue, red)
3. `Input` + `Textarea`

**Missing Critical Components**:
- [ ] Select / Dropdown
- [ ] Checkbox / Radio
- [ ] Toggle / Switch
- [ ] Modal / Dialog
- [ ] Drawer / Sheet

- [ ] Tabs
- [ ] Accordion
- [ ] Table / DataGrid
- [ ] Tooltip / Popover
- [ ] Toast / Snackbar (có primitives nhưng không reusable)
- [ ] Form Field wrapper
- [ ] Card variations

**Hệ quả**: Mỗi feature tự implement → Inconsistent UI patterns

---

## 🏠 II. PHÂN TÍCH LANDING PAGE

### A. Component Structure

```
LogiVNLanding (3700+ lines) ← MONOLITH
├── Hero Section
├── Trust Signals Grid
├── Platform Signals (4 cards)
├── Operating Lanes (3 personas)
├── Story Moments (6 chapters)
├── Product Demo
├── Testimonials
├── Pricing Tables
├── FAQ Accordion
└── Footer
```

### B. Vấn đề Landing Page

**❌ Critical:**
1. **Single file monolith**: 3700 lines, unmaintainable
2. **Hardcoded content**: All copy in JSX → No i18n support
3. **SEO issues**: Content locked trong JSX, Google khó index
4. **Performance**: Load toàn bộ 1 lúc, no lazy loading
5. **Reusability**: Zero, không tái sử dụng được gì

**⚠️ Moderate:**

6. Inline styles nhiều → Harder to override
7. Custom CSS classes (`.lv-hero`, `.lv-section`) → No design system connection
8. Gradient overload → Performance hit on older devices

### C. Landing Page Strengths ✅

1. **Vietnamese-first**: Native language, cultural fit
2. **Comprehensive**: Covers all value propositions
3. **Visual hierarchy**: Clear CTA placement
4. **Social proof**: Trust signals, testimonials
5. **Responsive**: Works on mobile/tablet/desktop

---

## 📱 III. PHÂN TÍCH DASHBOARD

### A. Layout Architecture

**3-Tier Responsive Navigation** (Good concept ✅):

```
Desktop (≥1024px): Full sidebar (232px width)
Tablet (768-1023px): Icon rail (76px width)
Mobile (<768px): Bottom nav (4 tabs) + Drawer menu
```

### B. Dashboard Vấn đề

**❌ Navigation Complexity**:
- 3 navigation systems parallel (Sidebar, Rail, Mobile)
- Logic scattered: `dashboard-nav.tsx` (700+ lines)

- Prefetch logic manual, no cache invalidation strategy
- Active state tracking phức tạp

**❌ Dashboard Client Layout**:
- `dashboard-client-layout.tsx`: 880 lines
- Mix data fetching + presentation + state management
- Hard to test, hard to modify

**⚠️ Glass Morphism Overuse**:
```css
--dashboard-glass-surface: rgba(255, 252, 246, 0.44)
backdrop-filter: blur(7px) saturate(1.12)
```
- Looks nice nhưng performance cost cao
- Accessibility contrast issues

### C. Dashboard Strengths ✅

1. **Real-time ready**: Socket.io integration
2. **AI integration**: CopilotKit, AI assistant dock
3. **Mobile-optimized**: Bottom nav thumb-friendly
4. **PWA support**: Push notifications, offline capability
5. **Command palette**: ⌘K quick actions

---

## 🚀 IV. ĐỀ XUẤT REBUILD STRATEGY

### Phase 1: Design System Foundation (4 tuần)

**Mục tiêu**: Xây dựng single source of truth cho design

#### 1.1 Design Tokens (Week 1-2)

**Tạo JSON-based token system**:


```json
// design-tokens/colors.json
{
  "brand": {
    "jade": { "value": "#0F4D3A" },
    "sage": { "value": "#A9C5A1" },
    "lacquer": { "value": "#F28C28" },
    "cream": { "value": "#FFF7EB" }
  },
  "semantic": {
    "primary": { "value": "{brand.jade}" },
    "secondary": { "value": "{brand.sage}" },
    "accent": { "value": "{brand.lacquer}" },
    "background": { "value": "{brand.cream}" }
  }
}

// design-tokens/typography.json
{
  "fontSize": {
    "xs": { "value": "0.75rem" },
    "sm": { "value": "0.875rem" },
    "base": { "value": "0.9375rem" },
    "lg": { "value": "1.0625rem" },
    "xl": { "value": "1.25rem" },
    "2xl": { "value": "1.5rem" }
  },
  "lineHeight": {
    "tight": { "value": "1.18" },
    "body": { "value": "1.45" },
    "relaxed": { "value": "1.6" }
  }
}
```

**Tool**: Style Dictionary để generate CSS/JS/iOS/Android tokens

#### 1.2 Theme System Redesign (Week 2)

**Single theme với semantic variants**:

```typescript
// lib/design-system/themes.ts
export const theme = {
  colors: {
    // Brand foundations
    brand: tokens.brand,

    // Semantic (context-agnostic)
    primary: tokens.semantic.primary,

    secondary: tokens.semantic.secondary,
    accent: tokens.semantic.accent,

    // Surface levels
    surface: {
      base: tokens.surface.base,
      raised: tokens.surface.raised,
      overlay: tokens.surface.overlay
    },

    // Text
    text: {
      primary: tokens.text.primary,
      secondary: tokens.text.secondary,
      muted: tokens.text.muted
    }
  },

  // Context-specific overrides
  contexts: {
    dashboard: {
      surface: { /* glass morphism variants */ },
      navigation: { /* nav-specific colors */ }
    },
    customer: {
      primary: '#006B3C', // Darker green for customer app
      accent: tokens.semantic.accent
    }
  }
}
```

**Bỏ**: 4 theme contexts riêng biệt
**Thay**: 1 theme + context overrides khi cần

#### 1.3 Responsive Grid System (Week 3)

**Tailwind-based với custom breakpoints**:

```javascript
// tailwind.config.js (v4 compatible)
module.exports = {
  theme: {
    screens: {
      'xs': '375px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1520px', // Dashboard max-width
    },

    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem'
      }
    }
  }
}
```

#### 1.4 Accessibility Guidelines (Week 4)

- **Color contrast**: WCAG AA minimum (4.5:1 for text)
- **Focus states**: Visible 2px outline with offset
- **Keyboard navigation**: Tab order, arrow keys, ESC
- **Screen reader**: ARIA labels, landmarks, live regions
- **Motion**: Respect `prefers-reduced-motion`

**Deliverables Phase 1**:
- ✅ Design tokens (JSON + generated CSS)
- ✅ Single theme system
- ✅ Responsive grid documented
- ✅ A11y checklist

---

### Phase 2: Component Library (6 tuần)

**Mục tiêu**: Xây dựng comprehensive, documented, tested component library

#### 2.1 Base Components (Week 1-2)

**Expand từ 3 → 20+ components**:

**Form Controls**:
- [x] Button (refactor existing)
- [x] Input (refactor existing)
- [ ] Select / Combobox
- [ ] Checkbox
- [ ] Radio
- [ ] Toggle/Switch
- [ ] Textarea (refactor)

**Feedback**:
- [x] Badge (refactor)
- [ ] Alert / Banner
- [ ] Toast / Snackbar

- [ ] Spinner / Skeleton
- [ ] Progress bar

**Overlays**:
- [ ] Modal / Dialog
- [ ] Drawer / Sheet
- [ ] Popover
- [ ] Tooltip
- [ ] Dropdown Menu

**Layout**:
- [ ] Card (variants: default, outlined, elevated)
- [ ] Accordion
- [ ] Tabs
- [ ] Divider

**Data Display**:
- [ ] Table / DataGrid
- [ ] List (ordered, unordered, description)
- [ ] Avatar
- [ ] Empty State

#### 2.2 Component API Design Pattern

**Consistent Props Structure**:

```typescript
// Ví dụ: Button component
export interface ButtonProps {
  // Visual
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean

  // State
  loading?: boolean
  disabled?: boolean

  // Icons
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode

  // Native props
  type?: 'button' | 'submit' | 'reset'
  onClick?: (e: React.MouseEvent) => void

  // A11y
  'aria-label'?: string
  'aria-describedby'?: string
}
```

**Compound Components Pattern**:

```tsx
// Card example
<Card variant="elevated">
  <CardHeader>
    <CardTitle>Dashboard</CardTitle>

    <CardDescription>Overview metrics</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    <Button>View Details</Button>
  </CardFooter>
</Card>
```

#### 2.3 Storybook Setup (Week 3)

**Documentation + Visual Regression**:

```javascript
// button.stories.tsx
export default {
  title: 'Components/Button',
  component: Button,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://figma.com/...'
    }
  }
}

export const Primary = {
  args: {
    variant: 'primary',
    children: 'Click me'
  }
}

export const AllVariants = () => (
  <Stack spacing={2}>
    <Button variant="primary">Primary</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="danger">Danger</Button>
  </Stack>
)
```

**Addons**:
- `@storybook/addon-a11y` - Accessibility testing
- `@storybook/addon-interactions` - User flow testing
- `chromatic` - Visual regression

#### 2.4 Dashboard-Specific Components (Week 4-5)

**Specialized Components**:

1. **DashboardCard**
   - KPI cards với metric, trend, sparkline
   - Variants: stat, chart, action

2. **DashboardNav**

   - Unified navigation component
   - Responsive variants built-in (sidebar/rail/mobile)
   - Prefetch logic abstracted

3. **DataTable**
   - Sorting, filtering, pagination
   - Row selection, bulk actions
   - Responsive (stacked on mobile)

4. **KanbanBoard**
   - Drag & drop (kitchen/orders boards)
   - Column customization
   - Real-time updates

5. **CommandPalette**
   - Refactor existing ⌘K
   - Keyboard shortcuts registry
   - Search + actions

#### 2.5 Testing Strategy (Week 6)

**3-Layer Testing**:

1. **Unit Tests** (Jest + React Testing Library)
   ```typescript
   test('Button renders with correct variant', () => {
     render(<Button variant="primary">Click</Button>)
     expect(screen.getByRole('button')).toHaveClass('btn-primary')
   })
   ```

2. **Visual Regression** (Chromatic)
   - All Storybook stories auto-tested
   - Catch unintended UI changes

3. **A11y Tests** (jest-axe)
   ```typescript
   test('Button is accessible', async () => {
     const { container } = render(<Button>Click</Button>)
     const results = await axe(container)
     expect(results).toHaveNoViolations()
   })
   ```

**Deliverables Phase 2**:
- ✅ 20+ documented components
- ✅ Storybook deployed
- ✅ Test coverage > 80%
- ✅ Component usage guidelines

---

### Phase 3: Page Rebuild (8 tuần)

**Mục tiêu**: Refactor landing + dashboard với new components

#### 3.1 Landing Page Refactor (Week 1-3)

**Tách Monolith → Modular Structure**:

```
app/page.tsx (Orchestration only)


components/landing/
├── hero-section.tsx (~100 lines)
├── trust-signals.tsx (~80 lines)
├── platform-signals.tsx (~120 lines)
├── operating-lanes.tsx (~150 lines)
├── story-moments.tsx (~200 lines)
├── product-demo.tsx (~100 lines)
├── testimonials-section.tsx (~80 lines)
├── pricing-section.tsx (~150 lines)
├── faq-section.tsx (~100 lines)
└── footer.tsx (~80 lines)

lib/content/
└── landing-content.json (All copy here, i18n-ready)
```

**Content Management**:

```json
// lib/content/landing-content.json
{
  "hero": {
    "title": "Hệ thống gọi món QR cho quán ăn Việt",
    "subtitle": "Menu điện tử, thanh toán VietQR, đặt bàn cọc tiền",
    "cta": {
      "primary": "Dùng thử 30 ngày miễn phí",
      "secondary": "Xem demo"
    }
  },
  "platformSignals": [
    {
      "icon": "QrCode",
      "title": "Khách vào bàn là có thể gọi món",
      "text": "Giảm thời gian chờ và giảm bước giải thích..."
    }
  ]
}
```

**SEO Improvements**:

```tsx
// components/landing/hero-section.tsx
export function HeroSection({ content }: { content: HeroContent }) {
  return (
    <section>
      <h1 className="text-4xl font-bold lg:text-6xl">
        {content.title}
      </h1>
      <p className="text-lg text-muted-foreground">
        {content.subtitle}
      </p>
      {/* Proper semantic HTML */}
    </section>
  )
}
```

**Performance Optimizations**:
- Lazy load below-the-fold sections
- Image optimization (Next.js Image)
- Code splitting per section

#### 3.2 Dashboard Navigation Rebuild (Week 4)

**Unified Navigation System**:

```tsx
// components/dashboard/navigation/dashboard-nav.tsx
export function DashboardNav({ variant }: { variant: 'sidebar' | 'rail' | 'mobile' }) {
  const routes = useDashboardRoutes()
  const prefetch = usePrefetchStrategy()

  switch (variant) {
    case 'sidebar':
      return <SidebarNav routes={routes} prefetch={prefetch} />
    case 'rail':

      return <RailNav routes={routes} prefetch={prefetch} />
    case 'mobile':
      return <MobileNav routes={routes} />
  }
}

// Usage in app-shell.tsx
<DashboardShell>
  <DashboardNav
    variant={useResponsiveVariant()}
    className="hidden lg:flex" // CSS handles responsive
  />
  {children}
</DashboardShell>
```

**Benefits**:
- Single component, multiple variants
- Shared logic (prefetch, active state)
- Easier to test

#### 3.3 Dashboard Overview Refactor (Week 5)

**Current**: `dashboard-client-layout.tsx` (880 lines)
**Target**: Modular workspace components

```tsx
// app/dashboard/page.tsx
export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <DashboardWorkspace>
      <DashboardHeader
        title="Tổng quan"
        subtitle="Theo dõi ca bán trong một màn hình"
        actions={<QuickActionsMenu />}
      />

      <DashboardGrid>
        <MetricsRow metrics={data.todayMetrics} />
        <ChartSection charts={data.charts} />
        <RecentActivityFeed items={data.recentActivity} />
        <AIInsightsPanel insights={data.aiInsights} />
      </DashboardGrid>
    </DashboardWorkspace>
  )
}
```

**Separation of Concerns**:
- Data fetching: Server Components
- Presentation: Client Components
- State: Zustand stores
- Real-time: Socket hooks

#### 3.4 Feature Workspaces Refactor (Week 6-7)

**Modularize Each Feature**:

```
components/dashboard/workspaces/
├── orders/
│   ├── orders-board.tsx
│   ├── order-card.tsx
│   ├── order-filters.tsx
│   └── use-orders-state.ts
├── kitchen/
│   ├── kitchen-board.tsx
│   ├── kitchen-ticket.tsx
│   └── use-kitchen-state.ts
├── tables/
│   ├── table-grid.tsx
│   ├── table-card.tsx
│   └── qr-code-generator.tsx
└── payments/
    ├── payment-list.tsx
    ├── payment-card.tsx
    └── use-payments-state.ts
```

**Pattern: Feature Slice**:


```typescript
// features/orders/
orders/
├── api/           # API calls
├── components/    # Feature-specific components
├── hooks/         # Feature hooks
├── stores/        # Zustand stores
├── types.ts       # TypeScript types
└── index.ts       # Public exports
```

#### 3.5 Glass Morphism Optimization (Week 8)

**Current Problem**: Overuse hurts performance

**Solution**: Progressive Enhancement

```css
/* Base style (no blur) */
.dashboard-card {
  background: var(--surface-raised);
  border: 1px solid var(--border);
}

/* Enhanced for capable devices */
@supports (backdrop-filter: blur(10px)) {
  @media (prefers-reduced-motion: no-preference) {
    .dashboard-card--glass {
      background: rgba(255, 252, 246, 0.8);
      backdrop-filter: blur(7px);
    }
  }
}
```

**Toggle via Settings**:
```typescript
// User can disable glass effects
const [glassEnabled, setGlassEnabled] = useUserPreference('glassEffects')
```

**Deliverables Phase 3**:
- ✅ Landing page fully modular
- ✅ Dashboard nav unified
- ✅ All feature workspaces refactored
- ✅ Performance improved >30%

---

## 📐 V. DESIGN SYSTEM GUIDELINES

### A. Component Naming Convention

**Format**: `{Domain}{Component}{Variant?}`

Examples:
- `Button` (base)
- `DashboardCard` (domain-specific)
- `FormInput` (context-specific)

**Avoid**:
- Generic prefixes: `New`, `Custom`, `My`
- Hungarian notation: `btnSubmit`, `txtName`

### B. File Organization

```
components/
├── ui/              # Base/primitive components
│   ├── button/
│   │   ├── button.tsx
│   │   ├── button.test.tsx
│   │   ├── button.stories.tsx
│   │   └── index.ts
│   └── ...
├── dashboard/       # Dashboard domain
└── customer/        # Customer domain

lib/
├── design-system/
│   ├── tokens/      # Design tokens
│   ├── themes/      # Theme definitions
│   └── utils/       # DS utilities
└── ...
```

### C. Props API Guidelines

**Always Include**:
- `className` for style overrides
- `data-testid` for testing
- Proper TypeScript types
- JSDoc comments

```typescript
/**
 * Primary button component for actions
 * @example
 * <Button variant="primary" onClick={handleClick}>
 *   Click me
 * </Button>
 */
export function Button({
  variant = 'primary',

  children,
  className,
  'data-testid': testId = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant }), className)}
      data-testid={testId}
      {...props}
    >
      {children}
    </button>
  )
}
```

### D. Styling Guidelines

**Preferred Order**:
1. Design tokens
2. Tailwind utilities
3. Component-specific CSS (if needed)
4. Inline styles (dynamic values only)

```tsx
// ✅ Good
<Card className={cn(
  "rounded-lg border border-border",  // Tailwind
  "bg-[var(--surface-raised)]",      // Token
  className                           // Override
)} />

// ❌ Bad
<Card style={{
  borderRadius: '8px',
  border: '1px solid #ccc',
  background: '#fff'
}} />
```

---

## 🎯 VI. MIGRATION STRATEGY

### A. Parallel Development

**Không rewrite toàn bộ một lúc** → Phát triển song song:

```
/components/ui/         ← New design system
/components/dashboard/  ← Gradually migrate
/components/landing/    ← Keep old, build new alongside

/components-v2/         ← (Optional) Staging area
```

### B. Feature Flags

**Progressive Rollout**:

```typescript
// lib/feature-flags.ts
export const features = {
  newLanding: process.env.NEXT_PUBLIC_NEW_LANDING === 'true',
  newDashboard: process.env.NEXT_PUBLIC_NEW_DASHBOARD === 'true',
  designSystemV2: true
}

// Usage
{features.newLanding ? <NewLandingPage /> : <OldLandingPage />}
```

### C. Codemods for Migration

**Automated refactoring**:

```javascript
// codemods/migrate-button.js
// Old: <button className="btn-primary">
// New: <Button variant="primary">

module.exports = function transformer(file, api) {
  const j = api.jscodeshift
  return j(file.source)
    .find(j.JSXElement, { openingElement: { name: { name: 'button' } } })
    .replaceWith(path => {
      // Transform logic
    })
    .toSource()
}
```

### D. Rollback Plan

**Safety Net**:
1. Keep old components until new ones are battle-tested
2. Feature flags allow instant rollback
3. Git branches: `main` (stable), `design-system-v2` (new)

---

## 📊 VII. SUCCESS METRICS

### A. Performance

**Targets**:
- Lighthouse Performance > 95
- First Contentful Paint < 1.2s
- Time to Interactive < 2.5s
- Bundle size reduction > 20%

**Measurement**:
```bash
# Before
npm run build
# Dashboard bundle: 850 KB

# After (target)
# Dashboard bundle: <680 KB
```

### B. Developer Experience

**Targets**:
- Component creation time: 30 min → 10 min
- Storybook coverage: 0% → 100%
- Test coverage: 45% → 80%
- Build time: No regression

### C. Accessibility

**Targets**:
- WCAG AA compliance: 100%
- Axe violations: 0
- Keyboard navigation: All flows supported
- Screen reader: All content accessible

### D. Design Consistency

**Audit Metrics**:

- Color usage: Reduce from 100+ variants → <30 tokens
- Typography scale: Enforce 6-8 sizes consistently
- Spacing system: 8px base grid adherence
- Component variants: Document all, remove duplicates

---

## 🛠️ VIII. TECH STACK RECOMMENDATIONS

### A. Keep (Already Good ✅)

- **Next.js 16** - Latest, stable
- **React 19** - Concurrent features
- **Tailwind v4** - Modern, performant
- **Lucide Icons** - Consistent, tree-shakeable
- **Framer Motion** - Animation library

### B. Add

**Design System**:
- **Style Dictionary** - Token management
- **CVA (class-variance-authority)** - Already using, expand usage
- **Radix UI** - Headless components for complex patterns (Select, Dialog, Popover)

**Documentation**:
- **Storybook 8** - Component documentation
- **Chromatic** - Visual regression
- **Docusaurus** - Design system docs site (optional)

**Testing**:
- **Vitest** - Faster than Jest
- **Playwright** - E2E testing (complement existing setup)
- **jest-axe** - Accessibility testing

### C. Migrate Away From

- **Manual CSS variables** → Style Dictionary tokens
- **Scattered theme contexts** → Single theme with overrides
- **Inline component implementations** → Radix UI primitives

---

## 📅 IX. IMPLEMENTATION TIMELINE

### Gantt Overview

```
Week 1-4:  [====Phase 1: Design System Foundation====]
Week 5-10: [========Phase 2: Component Library========]
Week 11-18:[==========Phase 3: Page Rebuild==========]

Milestones:
Week 4:  ✓ Design tokens + Theme v2
Week 10: ✓ Storybook deployed + 20 components
Week 18: ✓ Landing + Dashboard fully migrated
```

### Detailed Schedule

**Phase 1: Design System Foundation (4 weeks)**
- Week 1: Design tokens setup (Style Dictionary)
- Week 2: Theme system redesign, CSS variable cleanup
- Week 3: Responsive grid, breakpoint system
- Week 4: Accessibility guidelines, documentation

**Phase 2: Component Library (6 weeks)**
- Week 5-6: Base components (Form controls)
- Week 7: Feedback & Overlay components
- Week 8: Storybook setup + documentation
- Week 9-10: Dashboard-specific components
- Week 11: Testing setup (Vitest, axe, Chromatic)

**Phase 3: Page Rebuild (8 weeks)**
- Week 12-14: Landing page refactor
- Week 15: Dashboard navigation unification
- Week 16: Dashboard overview refactor
- Week 17-18: Feature workspaces migration
- Week 19: Performance optimization, final QA

**Post-Launch (Ongoing)**
- Component maintenance
- New component requests
- Design system evolution

---

## 💰 X. RESOURCE REQUIREMENTS

### A. Team Structure

**Minimum Team**:
- 1x Design System Lead (Full-time, 18 weeks)
- 1x Frontend Engineer (Full-time, 18 weeks)
- 0.5x UX Designer (Part-time, consultation)
- 0.25x QA Engineer (Part-time, testing)

**Ideal Team**:
- 1x Design System Lead
- 2x Frontend Engineers
- 1x UX Designer
- 0.5x QA Engineer
- 0.25x Accessibility Specialist

### B. External Tools Cost

| Tool | Monthly Cost | Purpose |
|------|--------------|---------|
| Storybook Cloud (optional) | $0 (self-host) | Component docs |
| Chromatic | $149/mo | Visual regression |
| Figma Professional | $15/user/mo | Design handoff |
| **Total** | **~$164/mo** | |

### C. Training & Onboarding

**Documentation Deliverables**:
- Component usage guide (Storybook)
- Design system handbook
- Code style guide
- Migration cookbook

**Team Training** (2-4 hours):
- Design tokens workshop
- Component API patterns
- Testing strategy
- A11y best practices

---

## ⚠️ XI. RISKS & MITIGATION

### Risk 1: Scope Creep
**Probability**: High
**Impact**: High

**Mitigation**:
- Stick to 3-phase plan rigidly
- Feature requests go to backlog
- Weekly sprint reviews

### Risk 2: Breaking Changes
**Probability**: Medium
**Impact**: High

**Mitigation**:
- Parallel development (old + new coexist)
- Feature flags for gradual rollout
- Comprehensive testing before swap

### Risk 3: Team Resistance
**Probability**: Medium
**Impact**: Medium

**Mitigation**:
- Early involvement in design decisions
- Clear documentation & examples
- Pair programming sessions

### Risk 4: Performance Regression
**Probability**: Low
**Impact**: High

**Mitigation**:
- Bundle analysis on every PR
- Lighthouse CI enforcement
- Performance budgets

---

## ✅ XII. ACCEPTANCE CRITERIA

### Phase 1 Complete When:
- [ ] Design tokens in JSON format
- [ ] Style Dictionary builds CSS/JS successfully
- [ ] Single theme system documented
- [ ] Responsive grid examples in Storybook
- [ ] A11y checklist published

### Phase 2 Complete When:
- [ ] 20+ components in Storybook
- [ ] Each component has:
  - [ ] TypeScript types
  - [ ] Unit tests (>80% coverage)
  - [ ] A11y tests passing
  - [ ] Visual regression baseline
- [ ] Dashboard-specific components built
- [ ] Component usage docs written

### Phase 3 Complete When:
- [ ] Landing page split into <15 modular components
- [ ] Dashboard navigation unified (1 component, 3 variants)
- [ ] All feature workspaces using new components
- [ ] Lighthouse score >95
- [ ] Zero accessibility violations
- [ ] Old code removed (no `/components-v1/` lingering)

---

## 🚀 XIII. NEXT STEPS

### Immediate Actions (This Week)

1. **Stakeholder Approval**
   - Review this proposal with team
   - Align on priorities & timeline
   - Assign resources

2. **Kickoff Meeting**
   - Design System Lead introduction
   - Define success metrics
   - Set up project board

3. **Repository Setup**
   ```bash
   git checkout -b design-system-v2
   mkdir -p lib/design-system/tokens
   npm install --save-dev style-dictionary
   ```

4. **Begin Phase 1**
   - Create first design token file
   - Set up Style Dictionary config
   - Generate first CSS output

### Week 2 Onwards

- Follow phase plan strictly
- Weekly demos to stakeholders
- Bi-weekly design reviews
- Monthly retrospectives

---

## 📚 XIV. APPENDIX

### A. Reference Projects

**Inspiration (Good Design Systems)**:
- **Vercel Design** - Clean, minimal, performance-focused
- **Shadcn/ui** - Radix + Tailwind patterns (similar to our approach)
- **Chakra UI** - Accessibility-first approach
- **Material Design 3** - Comprehensive token system

### B. Learning Resources

**For Team**:
- [Design Tokens 101](https://www.designtokens.org/)
- [Radix UI Primitives](https://www.radix-ui.com/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Storybook Best Practices](https://storybook.js.org/docs/react/writing-docs/introduction)

### C. Color Palette Reference

**Current Brand Colors**:
```css
--brand-primary: #0F4D3A    /* Jade Green - Main brand */
--brand-secondary: #A9C5A1  /* Soft Sage - Accent */
--brand-accent: #F28C28     /* Lacquer Orange - CTA */
--brand-background: #FFF7EB /* Warm Cream - Base */
```

**Semantic Mappings** (Keep these consistent):
- Success = Primary (Jade)
- Warning = Accent (Lacquer)
- Danger = Tertiary (#2B2B2B, consider warming up)
- Info = Secondary (Sage)

### D. Typography Stack

```css
--font-display: Sora, Inter, sans-serif;     /* Headings */
--font-body: Inter, sans-serif;              /* Body text */
--font-mono: Geist Mono, monospace;          /* Code */
```

**Hierarchy**:
- H1: 2.5rem (40px) / Bold 700
- H2: 2rem (32px) / SemiBold 650
- H3: 1.5rem (24px) / SemiBold 650
- Body: 0.9375rem (15px) / Regular 400
- Small: 0.875rem (14px) / Regular 400

---

## 📞 XV. CONTACT & OWNERSHIP

**Design System Lead**: TBD
**Project Manager**: TBD
**Stakeholders**: Product, Engineering, Design

**Document Version**: 1.0
**Last Updated**: 2026-06-11
**Next Review**: Phase 1 completion (Week 4)

---

## 🎉 CONCLUSION

Rebuild UI/UX của LogiVN Platform là một đầu tư cần thiết để:
- **Scalability**: Dễ thêm features mới
- **Consistency**: Brand experience thống nhất
- **Performance**: Faster, lighter pages
- **Developer Experience**: Easier to build, maintain, test
- **Accessibility**: Inclusive for all users

**Timeline**: 18 tuần (4.5 tháng)
**Team**: 2-4 người
**ROI**: Long-term maintenance cost ↓ 50%, velocity ↑ 40%

Với chiến lược 3-phase phát triển song song, rủi ro được giảm thiểu tối đa trong khi vẫn đảm bảo tiến độ.

**Recommended Decision**: ✅ Approve và bắt đầu Phase 1 ngay lập tức.
