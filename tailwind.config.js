/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // 🌙 Dark mode'u sınıfla kontrol et
  theme: {
    extend: {
      colors: {
        background: '#181818',     // Ana dark arka plan
        foreground: '#eeeeee',     // Yazı rengi
        card: '#242424',           // Kartlar veya panel rengi
        accent: '#3b82f6',         // Öne çıkan buton vs
        muted: '#555555',          // İkincil metin
      },
    },
  },
  plugins: [],
};
