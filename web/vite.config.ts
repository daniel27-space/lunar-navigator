import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works at any path (GitHub Pages serves it from /lunar-navigator/).
  base: './',
  plugins: [react()],
})
