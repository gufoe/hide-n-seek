// uno.config.ts
import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
    // ...UnoCSS options
    presets: [
        presetUno,
    ],
    shortcuts: {
        'overlay': 'absolute top-0 left-0 right-0 bottom-0',
        'layflex': 'flex flex-col flex-grow',
    }
})
