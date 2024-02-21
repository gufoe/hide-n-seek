import { random } from "lodash";
import { Direction, TPS, MapInstance, MessageFromPlayer, MessageFromServer, PlayerJson, Pos, MOVE_MS, MAP_SIZE, NETWORK_GITTER, NETWORK_DELAY, PLAYER_ICONS } from "./common/game";
import WebSocket, { WebSocketServer } from 'ws';
import { applyNetworkDelay, log, sleep } from './common/utils'
import { GAME_TIMEOUT } from "./common/game";


export class Server {
    map?: MapInstance
    players: Player[] = []
    private last_update?: string
    start_at = 0

    constructor(public ws: WebSocketServer) {
        this.ws.on('connection', (socket) => this.onJoin(socket))
    }

    time() {
        return performance.now() - this.start_at
    }

    log(...args: any[]) {
        console.log(''.padEnd(5 - String(Math.floor(this.time())).length, ' '), Math.floor(this.time()), ...args)
    }

    async play() {
        this.reset()
        this.log('Send init')

        // Send init message to all players
        this.broadcast(this.getInitMessage())


        this.log('Start loop')
        while (this.time() < GAME_TIMEOUT) {
            const t_start = this.time()
            await this.update()
            const dt = this.time() - t_start
            // this.log('Update took', Math.round(dt), 'ms')
            await sleep((1000 / TPS) - dt)

            if (!this.isPlaying()) {
                this.log('Game is dead, stop')
                return
            }
        }
    }

    isPlaying() {
        return this.players.some(p => p.json.is_hiding && !p.json.is_dead)
            || !this.players.some(p => p.json.is_hiding)
    }

    private reset() {
        // Reset map
        this.map = MapInstance.generate({
            clutter: 0.2,
            size: MAP_SIZE,
        })
        // Reset players
        this.players.forEach(pl => {
            pl.json = this.randomPlayerJson()
        })

        this.start_at = performance.now()
    }



    isWalkable(pos: Pos): boolean {
        if (!this.map?.get(pos)) return false
        return this.map?.get(pos)?.icon == 'grass'
    }
    getPlayers(pos: Pos): Player[] {
        return this.players.filter(pl =>
            Math.abs(pl.json.pos.x - pos.x) < 0.1
            && Math.abs(pl.json.pos.y - pos.y) < 0.1)
    }


    async update() {
        // Update player positions that have been moving for enough time
        this.players.forEach(pl => {
            pl.updatePositionAndEat()
        })

        // Broadcast game updates
        this.sendUpdate()
    }

    sendUpdate() {
        const players = this.players.map(p => p.json)
        if (!this.last_update || this.last_update != JSON.stringify(players)) {
            this.last_update = JSON.stringify(players)
            this.broadcast({
                Update: {
                    time: this.time(),
                    players,
                }
            })
        }
    }

    async broadcast(message: MessageFromServer) {
        this.players.forEach(pl => pl.send(message))
    }

    async onJoin(socket: WebSocket) {
        const send = socket.send
        socket.send = (data: string) => {
            applyNetworkDelay(() => send.call(socket, data, {}))
        }
        this.log('player joininig')

        const player = new Player(this, socket, this.randomPlayerJson())
        this.players.push(player)
        player.send(this.getInitMessage())

        const ping_int = setInterval(() => {
            player.send({ GetTime: { a: this.time() } })
        }, 1000);

        socket.on('close', () => {
            this.log('player disconnected')
            const i = this.players.indexOf(player)
            this.players.splice(i, 1)
            clearInterval(ping_int)
        })
    }

    getInitMessage(): MessageFromServer {
        if (!this.map) throw Error
        return {
            Init: {
                time: this.time(),
                map: this.map.json,
                players: this.players.map(p => p.json),
            }
        }
    }

    randomPlayerJson(): PlayerJson {
        if (!this.map) throw Error
        const is_hiding = Math.random() > 0.5 ? 'bush' : undefined
        return {
            dir: 'up',
            is_hiding,
            skin: PLAYER_ICONS[Math.floor(Math.random() * PLAYER_ICONS.length)],
            name: 'test',
            is_dead: false,
            pos: {
                x: random(0, this.map.size.x - 1, false),
                y: random(0, this.map.size.y - 1, false),
            }
        }
    }
}

class Player {
    constructor(
        public server: Server,
        public socket: WebSocket,
        public json: PlayerJson,
    ) {

        socket.on('message', (payload) => {
            applyNetworkDelay(() => {
                const message: MessageFromPlayer = JSON.parse(payload.toString())
                this.onMessage(message)
            })
        })
    }

    send(message: MessageFromServer) {
        this.socket.send(JSON.stringify(message))
    }



    private best_rtt?: number
    updatePositionAndEat() {
        if (this.json.is_dead) {
            this.json.move = undefined
            return
        }

        const m = this.json.move
        if (!m) return

        if (this.server.time() < m.time + MOVE_MS) return

        this.json.pos = m.end
        // If player has no next move, reset the move
        if (!m.next) {
            this.json.move = undefined
        } else {
            this.json.move = undefined

            // Otherwise reset the move and send the next command
            this.move({
                time: this.server.time(),
                dir: m.next,
            })
        }

        // Check hits with other objects
        const hit = this.server.getPlayers(this.json.pos)
        hit.forEach(hit => {
            if (!this.json.is_hiding && hit.json.is_hiding) {
                hit.json.is_dead = true
            }
        })

    }


    move(move: MessageFromPlayer['StartMove']) {
        if (!move) {
            return
        }
        if (this.json.move) {
            this.json.move.next = move.dir
            return
        }
        let end: Pos | undefined = addDirection(move.dir, this.json.pos)

        this.json.dir = move.dir

        if (!this.server.isWalkable(end)) {
            return
        }

        this.json.move = {
            time: move.time,
            end,
            next: this.json.dir,
        }
    }


    onMessage(message: MessageFromPlayer) {
        const json = this.json

        if (message.GetTimeResponse) {
            let rtt = this.server.time() - message.GetTimeResponse.a
            if (this.best_rtt === undefined || this.best_rtt > rtt) {
                this.best_rtt = rtt
            }
            return
        }
        if (message.SetName) {
            json.name = message.SetName
        }
        if (message.GetTime) {
            this.send({ GetTimeResponse: { a: message.GetTime.a, b: this.server.time() } })
        }
        if (!json.is_dead && message.StartMove) {
            this.server.log('pl start move', message.StartMove)
            this.move(message.StartMove)
        }
        if (!json.is_dead && message.StopMove) {
            if (json.move) {
                this.server.log('pl stop move', message.StopMove)
                json.move.next = undefined
            }
        }
        this.server.sendUpdate()
    }
}

function addDirection(dir: Direction, p: { x: number, y: number }) {
    if (dir == 'down') {
        return { x: p.x, y: p.y + 1 }
    }
    if (dir == 'up') {
        return { x: p.x, y: p.y - 1 }
    }
    if (dir == 'left') {
        return { x: p.x - 1, y: p.y }
    }
    if (dir == 'right') {
        return { x: p.x + 1, y: p.y }
    }
    throw new Error
}