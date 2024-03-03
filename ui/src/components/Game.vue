<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Client } from "./client";
import { MessageFromServer } from "../common/game";
const bg_ref = ref<undefined | HTMLCanvasElement>(undefined);
const game_ref = ref<undefined | HTMLCanvasElement>(undefined);
const screen_ref = ref<undefined | HTMLDivElement>(undefined);
let c = ref<undefined | Client>(undefined);
onMounted(() => {
  let name = localStorage.getItem("name");
  if (!name) {
    name = prompt("what is your name");
    if (name) localStorage.setItem("name", name);
    if (!name) name = "noob";
  }
  c.value = (window as any).client = new Client(
    name,
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
  go: undefined as undefined | MessageFromServer["GameOver"],
});
setInterval(() => {
  info.rtt = c.value?.best_rtt ?? 999;
  info.last_rtt = c.value?.last_rtt ?? 999;
  info.time = c.value?.time() ?? 0;
  info.go = c.value?.state?.game_over;
}, 1000 / 10);
</script>

<template>
  <div class="layflex bg-black text-white p-2">
    <div class="h-5 text-center flex flex-row gap-4 justify-center">
      <div v-if="info.rtt >= 0">
        rtt: {{ info.last_rtt.toFixed(1) }} / {{ info.rtt.toFixed(1) }} ms
      </div>
      <div v-if="info.rtt >= 0">
        timer:
        {{ (((c?.state?.timeout ?? 0) - info.time) / 1000).toFixed(1) }}
      </div>
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
    <template v-if="info.go">
      <div
        v-if="!info.go.winners.includes(c?.state?.player_id ?? 0)"
        class="overlay bg-red bg-opacity-70 duration-200 flex flex-row items-center"
      >
        <div class="text-center m-auto">
          <h2>GameOver</h2>
          You lost because you noob.
        </div>
      </div>
      <div
        v-else
        class="overlay bg-green bg-opacity-70 duration-200 flex flex-row items-center"
      >
        <div class="text-center m-auto">
          <h2>Game Complete</h2>
          You have won!
        </div>
      </div>
    </template>
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
