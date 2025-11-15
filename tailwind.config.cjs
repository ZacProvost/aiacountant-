const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './**/*.{ts,tsx,js,jsx}',
    '!./node_modules/**/*',
    '!./dist/**/*',
  ],
  theme: {
    extend: {
      colors: {
        'fiscalia-primary-dark': '#1B1F2A',
        'fiscalia-accent-gold': '#C9A86A',
        'fiscalia-light-neutral': '#F9F9F9',
        'fiscalia-error': '#C75D5D',
        'fiscalia-success': '#5D9C7A',
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        display: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        lg: '8px',
      },
      boxShadow: {
        card: '0px 2px 8px rgba(27, 31, 42, 0.05)',
        'card-hover': '0px 4px 12px rgba(27, 31, 42, 0.08)',
        button: '0px 2px 6px rgba(201, 168, 106, 0.2)',
      },
      spacing: {
        128: '32rem',
      },
    },
  },
  plugins: [],
}

