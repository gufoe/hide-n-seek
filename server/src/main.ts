import { WebSocketServer } from "ws"
import { Server } from "./server"
import { sleep } from "./common/utils"


(async function () {
    const server = new Server(new WebSocketServer({ host: '0.0.0.0', port: 54321 }))

    while (true) {
        await server.play()
    }

})()
