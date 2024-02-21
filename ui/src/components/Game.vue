<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Client } from "./client";
const bg_ref = ref<undefined | HTMLCanvasElement>(undefined);
const game_ref = ref<undefined | HTMLCanvasElement>(undefined);
const screen_ref = ref<undefined | HTMLDivElement>(undefined);
let c = ref<undefined | Client>(undefined);
onMounted(() => {
  c.value = (window as any).client = new Client(
    location.protocol.replace("http", "ws") +
      "//" +
      (location.hash.substring(1) || location.hostname + ":54321"),
    bg_ref.value!,
    game_ref.value!
  );
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
const info = reactive({
  rtt: 0,
  last_rtt: 0,
  time: 0,
});
setInterval(() => {
  info.rtt = c.value?.best_rtt ?? 999;
  info.last_rtt = c.value?.last_rtt ?? 999;
  info.time = c.value?.time() ?? 0;
}, 1000);
</script>

<template>
  <div class="layflex bg-black text-white p-2">
    <div class="h-5 text-center flex flex-row gap-4 justify-center">
      <div v-if="info.rtt >= 0">
        rtt: {{ info.last_rtt.toFixed(1) }} / {{ info.rtt.toFixed(1) }} ms
      </div>
      <div v-if="info.rtt >= 0">time: {{ info.time.toFixed(0) }} ms</div>
    </div>
    <div ref="screen_ref" class="layflex relative">
      <canvas
        ref="bg_ref"
        class="overlay m-auto image-render-pixel rounded-10px"
      />
      <canvas
        ref="game_ref"
        class="overlay m-auto image-render-pixel rounded-10px"
      />
    </div>
    <div class="flex flex-row gap-10px relative justify-center py-3px">
      <button
        class="text-5xl bg-dark color-gray border-none rounded-7px flex items-center justify-center h-50px w-50px border-b-2 border-r-2 border-b-solid border-b-dark-50 border-r-dark-300 border-r-solid active:bg-dark-200"
        v-for="key in [
          { code: 'ArrowDown', text: '↓' },
          { code: 'ArrowUp', text: '↑' },
          { code: 'ArrowLeft', text: '←' },
          { code: 'ArrowRight', text: '→' },
        ]"
        @touchstart.passive="c?.setKey(key.code, true)"
        @mousedown="c?.setKey(key.code, true)"
        @touchend.passive="c?.setKey(key.code, false)"
        @mouseup="c?.setKey(key.code, false)"
        v-text="key.text"
      />
    </div>
  </div>
</template>
