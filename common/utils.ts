import { NETWORK_DELAY, NETWORK_GITTER } from "./game"

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
export function log(...args: any[]) {
    console.log(Math.floor(Date.now()), ...args)
}

export function applyNetworkDelay(do_send: CallableFunction) {
    if (NETWORK_GITTER || NETWORK_DELAY) {
        setTimeout(do_send, Math.random() * NETWORK_GITTER + NETWORK_DELAY)
    } else {
        do_send()
    }
}