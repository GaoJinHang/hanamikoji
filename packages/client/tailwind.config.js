/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 艺伎颜色
        sakura: '#FFB6C1',
        ume: '#DDA0DD',
        ran: '#87CEEB',
        take: '#90EE90',
        kiku: '#FFA500',
        bara: '#FF6347',
        yuri: '#FFD700',
        // 行动颜色
        secret: '#3B82F6',
        discard: '#6B7280',
        gift: '#10B981',
        competition: '#EF4444',
        // 游戏主色调
        game: {
          bg: '#Fdfcf5',
          primary: '#d9465c',
          secondary: '#d4af37',
          text: '#2d2d2d',
          card: '#ffffff',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Noto Serif JP', 'serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'card-flip': 'card-flip 0.5s ease-in-out',
        'card-appear': 'card-appear 0.3s ease-out',
      },
      keyframes: {
        'card-flip': {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
        'card-appear': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
