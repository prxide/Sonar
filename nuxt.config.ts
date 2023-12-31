export default defineNuxtConfig({
  experimental: {
    renderJsonPayloads: false,
  },
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  modules: [
    'nuxt-vuefire',
    'nuxt-primevue',
    '@pinia/nuxt',
    '@nuxt/test-utils/module',
  ],
  primevue: {
    usePrimeVue: true,
    options: {
      ripple: true,
    },
    components: {
      prefix: '',
      name: undefined,
      include: [
        'Button',
        'Slider',
        'Dropdown',
        'Skeleton',
        'InputText',
        'FileUpload',
        'Knob',
      ],
      exclude: undefined,
    },
    directives: {
      prefix: '',
      name: undefined,
      include: undefined,
      exclude: '*',
    },
    composables: {
      prefix: '',
      name: undefined,
      include: undefined,
      exclude: '*',
    },
  },
  vuefire: {
    config: {
      apiKey: process.env.API_KEY,
      authDomain: 'sonar0.firebaseapp.com',
      projectId: 'sonar0',
      storageBucket: 'sonar0.appspot.com',
      messagingSenderId: '1096856922094',
      appId: '1:1096856922094:web:9df9aea96f320e132e90ff',
      measurementId: 'G-JFRVL2QV3C',
    },
  },
  css: ['assets/css/main.css', 'assets/css/theme.css'],
});
