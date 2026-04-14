import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#7C3AED', foreground: '#ffffff' },
        sidebar: '#1e1b4b',
      },
    },
  },
  plugins: [],
}

export default config
