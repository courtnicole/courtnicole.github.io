import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import icon from "astro-icon";

import compress from "astro-compress";

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind({
    applyBaseStyles: false
  }), icon({
    iconDir: "src/assets/icons",
    include: {
      teenyicons: ['vr-headset-outline'],
      ion: ['bookmark-outline', 'information-circle-outline', 'notifications-outline', 'checkbox-outline', 'warning-outline', 'alert-circle-outline']
    }
  }), compress()]
});