import type { Config } from 'tailwindcss';

const rgb = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: rgb('bg'),
        surface: rgb('surface'),
        surface2: rgb('surface-2'),
        card: rgb('card'),
        fg: rgb('fg'),
        muted: rgb('muted'),
        hero: rgb('hero-bg'),
        projects: rgb('projects-bg'),
        lab: rgb('lab-bg'),
        contact: rgb('contact-bg'),
        electric: rgb('blue'),
        acid: rgb('green'),
        hot: rgb('orange'),
        volt: rgb('purple'),
        ink: '#0B0D1A',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'float-sm': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-5px)' } },
        orbit: { to: { transform: 'rotate(360deg)' } },
        rise: { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-sm': 'float-sm 6s ease-in-out infinite',
        orbit: 'orbit 70s linear infinite',
        'orbit-rev': 'orbit 95s linear infinite reverse',
        rise: 'rise .8s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};
export default config;
