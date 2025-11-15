/**
 * Accessibility utilities for WCAG 2.1 AA compliance
 * Provides helpers for ARIA labels, keyboard navigation, and screen reader support
 */

/**
 * Generates accessible labels for form inputs
 */
export function generateAriaLabel(
  fieldName: string,
  value?: string | number,
  required?: boolean
): string {
  let label = fieldName;
  
  if (required) {
    label += ', requis';
  }
  
  if (value !== undefined && value !== null && value !== '') {
    label += `, valeur actuelle: ${value}`;
  }
  
  return label;
}

/**
 * Generates ID for linking labels to inputs
 */
export function generateInputId(prefix: string, fieldName: string): string {
  return `${prefix}-${fieldName.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Keyboard navigation handler for lists
 */
export function handleListKeyboardNavigation(
  event: React.KeyboardEvent,
  currentIndex: number,
  totalItems: number,
  onSelect: (index: number) => void
): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (currentIndex < totalItems - 1) {
        onSelect(currentIndex + 1);
      }
      break;
    case 'ArrowUp':
      event.preventDefault();
      if (currentIndex > 0) {
        onSelect(currentIndex - 1);
      }
      break;
    case 'Home':
      event.preventDefault();
      onSelect(0);
      break;
    case 'End':
      event.preventDefault();
      onSelect(totalItems - 1);
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      // Trigger selection (handled by parent)
      break;
  }
}

/**
 * Focus trap for modal dialogs
 */
export class FocusTrap {
  private focusableElements: HTMLElement[] = [];
  private firstFocusable: HTMLElement | null = null;
  private lastFocusable: HTMLElement | null = null;

  constructor(private container: HTMLElement) {
    this.updateFocusableElements();
  }

  private updateFocusableElements(): void {
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    
    this.focusableElements = Array.from(
      this.container.querySelectorAll<HTMLElement>(selector)
    );
    
    this.firstFocusable = this.focusableElements[0] || null;
    this.lastFocusable = this.focusableElements[this.focusableElements.length - 1] || null;
  }

  handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;

    // Update focusable elements in case DOM changed
    this.updateFocusableElements();

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === this.firstFocusable) {
        event.preventDefault();
        this.lastFocusable?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === this.lastFocusable) {
        event.preventDefault();
        this.firstFocusable?.focus();
      }
    }
  };

  activate(): void {
    this.container.addEventListener('keydown', this.handleKeyDown);
    this.firstFocusable?.focus();
  }

  deactivate(): void {
    this.container.removeEventListener('keydown', this.handleKeyDown);
  }
}

/**
 * Announces content to screen readers
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  // Create or get the live region
  let liveRegion = document.getElementById('sr-announcer');
  
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'sr-announcer';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }

  // Update aria-live if priority changed
  liveRegion.setAttribute('aria-live', priority);

  // Clear and set new message
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion!.textContent = message;
  }, 100);
}

/**
 * Color contrast checker (WCAG 2.1 AA requires 4.5:1 for normal text)
 */
export function checkColorContrast(foreground: string, background: string): {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
} {
  // Convert hex to RGB
  const hexToRgb = (hex: string): [number, number, number] | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : null;
  };

  // Calculate relative luminance
  const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);

  if (!fg || !bg) {
    return { ratio: 0, passesAA: false, passesAAA: false };
  }

  const l1 = getLuminance(...fg);
  const l2 = getLuminance(...bg);

  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
  };
}

/**
 * Skip link component for keyboard navigation
 */
export function createSkipLink(targetId: string, label: string = 'Aller au contenu principal'): HTMLElement {
  const skipLink = document.createElement('a');
  skipLink.href = `#${targetId}`;
  skipLink.textContent = label;
  skipLink.className = 'skip-link';
  skipLink.style.position = 'absolute';
  skipLink.style.top = '-40px';
  skipLink.style.left = '0';
  skipLink.style.background = '#000';
  skipLink.style.color = '#fff';
  skipLink.style.padding = '8px';
  skipLink.style.textDecoration = 'none';
  skipLink.style.zIndex = '9999';

  // Show on focus
  skipLink.addEventListener('focus', () => {
    skipLink.style.top = '0';
  });

  skipLink.addEventListener('blur', () => {
    skipLink.style.top = '-40px';
  });

  return skipLink;
}

/**
 * Accessibility checker for form validation
 */
export function validateFormAccessibility(form: HTMLFormElement): string[] {
  const issues: string[] = [];

  // Check for labels
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach((input) => {
    const inputElement = input as HTMLInputElement;
    const id = inputElement.id;
    const name = inputElement.name;
    
    if (!id) {
      issues.push(`Input without ID: ${name || 'unnamed'}`);
    } else {
      const label = form.querySelector(`label[for="${id}"]`);
      if (!label && !inputElement.getAttribute('aria-label')) {
        issues.push(`Input without label or aria-label: ${id}`);
      }
    }
  });

  // Check for required fields
  const required = form.querySelectorAll('[required]');
  required.forEach((field) => {
    if (!field.getAttribute('aria-required') && !field.getAttribute('aria-invalid')) {
      issues.push(`Required field without aria-required: ${(field as HTMLElement).id || 'unnamed'}`);
    }
  });

  return issues;
}

/**
 * Formats currency for screen readers
 */
export function formatCurrencyForScreenReader(amount: number): string {
  return `${amount.toFixed(2)} dollars`;
}

/**
 * Formats date for screen readers
 */
export function formatDateForScreenReader(date: string): string {
  const d = new Date(date);
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return d.toLocaleDateString('fr-FR', options);
}

/**
 * Common ARIA attributes for components
 */
export const ariaAttributes = {
  button: (label: string, expanded?: boolean) => ({
    'aria-label': label,
    ...(expanded !== undefined && { 'aria-expanded': expanded }),
  }),
  
  modal: (labelId: string, descId?: string) => ({
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': labelId,
    ...(descId && { 'aria-describedby': descId }),
  }),

  tabList: () => ({
    role: 'tablist',
  }),

  tab: (selected: boolean, controls: string) => ({
    role: 'tab',
    'aria-selected': selected,
    'aria-controls': controls,
    tabIndex: selected ? 0 : -1,
  }),

  tabPanel: (labelledBy: string, hidden: boolean) => ({
    role: 'tabpanel',
    'aria-labelledby': labelledBy,
    hidden,
    tabIndex: 0,
  }),

  menu: () => ({
    role: 'menu',
  }),

  menuItem: (label?: string) => ({
    role: 'menuitem',
    ...(label && { 'aria-label': label }),
  }),

  alert: (type: 'error' | 'warning' | 'info' | 'success') => ({
    role: 'alert',
    'aria-live': type === 'error' ? 'assertive' : 'polite',
  }),
};


