import { clone, maxBy, sortBy, values } from 'lodash'
import { Direction, MOVE_MS, MapIcon, MapInstance, MessageFromPlayer, MessageFromServer, PlayerIcon, PlayerJson, Pos, TileJson } from '../common/game'
export class Client {
    ws: WebSocket
    state?: {
        start_at: number
        player_id: number
        map: MapInstance
        players: PlayerJson[]
        last_update_time: number
        timeout: number
        game_over?: MessageFromServer['GameOver']
    }
    ts = 0
    draw_int = 0

    keys: Record<string, [number, string]> = {}

    setKey(code: string, active: boolean) {
        if (active) {
            this.keys[code] = [Date.now(), code]
        } else {
            delete (this.keys[code])
        }
        this.sendNewDirection()
    }

    best_rtt: number | undefined
    last_rtt: number | undefined
    server_time_offset: number = 0

    toLocalTime(t: number) {
        return t + this.server_time_offset
    }

    sendPing() {
        this.send({ GetTime: { a: Date.now() } })
    }

    constructor(
        public player_name: string,
        public host: string,
        public map_canvas: HTMLCanvasElement,
        public game_canvas: HTMLCanvasElement,
    ) {
        this.ws = new WebSocket(host);
        this.ws.onopen = () => {
            this.sendPing()
            this.send({
                SetName: this.player_name
            })
        }
        const ping_int = setInterval(() => {
            this.sendPing()
        }, 100);

        this.ws.onclose = () => {
            clearInterval(ping_int)
            setTimeout(() => location.reload(), 1000)
        }
        this.ws.onmessage = (ev) => {
            const message: MessageFromServer = JSON.parse(ev.data);
            if (message.GetTime) {
                this.send({ GetTimeResponse: { a: message.GetTime.a, b: Date.now() } })
                return
            }
            if (message.GetTimeResponse) {
                let rtt = Date.now() - message.GetTimeResponse.a
                this.last_rtt = rtt
                if (this.best_rtt === undefined || this.best_rtt > rtt) {
                    this.best_rtt = rtt
                    this.server_time_offset = Date.now() - (message.GetTimeResponse.b + rtt / 2)
                }
                return
            }
            if (message.Init) {
                this.state = {
                    map: new MapInstance(message.Init.map),
                    player_id: message.Init.player_id,
                    players: message.Init.players,
                    timeout: message.Init.timeout,
                    start_at: Date.now() - message.Init.time,
                    last_update_time: 0
                }
                this.adjustTileSize()
                this.drawMap()
            }
            if (message.GameOver && this.state) {
                this.state.game_over = message.GameOver
            }
            if (this.state && message.Update) {
                if (message.Update.time >= this.state.last_update_time) {
                    this.state.last_update_time = message.Update.time
                    this.state.players = message.Update.players
                }
            }
        };
        const loop = () => {
            this.drawPlayers()
            requestAnimationFrame(loop)
        }
        loop()

        window.addEventListener('keydown', (e) => {
            if (this.keys[e.key]) return
            this.setKey(e.key, true)
        })
        window.addEventListener('keyup', (e) => {
            this.setKey(e.key, false)
        })

    }

    send(message: MessageFromPlayer) {
        this.ws.send(JSON.stringify(message))
    }

    private last_dir?: Direction
    private sendNewDirection() {
        const w = this.wantedMove()
        if (this.last_dir == w) return
        this.last_dir = w
        if (w) {
            this.send({ StartMove: { dir: w, time: this.time() } })
        } else {
            console.log('send stop', w)
            this.send({ StopMove: [] })
        }
    }

    time(opts: { compensation: boolean } = { compensation: true }) {
        let ret = Date.now() - (this.state?.start_at ?? 0)
        if (opts.compensation) ret += (this.best_rtt ?? 0) / 2
        return ret
    }

    wantedMove(): Direction | undefined {
        let min = maxBy(values(this.keys), ([t]) => t)
        if (!min) return
        const x: Record<string, Direction> = {
            'ArrowDown': 'down',
            'ArrowUp': 'up',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
        }
        return x[min[1]]
    }

    adjustTileSize() {
        if (!this.state) return
        const canvas = this.map_canvas;
        const screen = canvas.parentElement!;
        const map = this.state.map

        let bb = {
            x: screen.clientWidth,
            y: screen.clientHeight,
        };

        this.ts = Math.floor(Math.min(bb.x / map.size.x, bb.y / map.size.y));

        this.map_canvas.width = this.game_canvas.width = map.size.x * this.ts;
        this.map_canvas.height = this.game_canvas.height = map.size.y * this.ts;
    }

    drawMap() {
        if (!this.state) return
        const ctx = this.map_canvas.getContext("2d")!;
        // ctx.globalCompositeOperation = "copy";
        ctx.clearRect(0, 0, this.map_canvas.width, this.map_canvas.height)
        this.state.map.json.tiles.forEach((tile) => this.drawTile(ctx, this.ts, tile));
    }

    drawPlayers() {
        const ctx = this.game_canvas.getContext("2d")!;
        // ctx.globalCompositeOperation = "copy";
        if (!this.state) return
        ctx.clearRect(0, 0, this.game_canvas.width, this.game_canvas.height)
        ctx.clearRect(0, 0, this.game_canvas.width, this.game_canvas.height)
        sortBy(this.state.players, p => p.move?.end.y ?? p.pos.y).forEach((pl) => this.drawPlayer(ctx, this.ts, pl));
    }


    drawTile(ctx: CanvasRenderingContext2D, size: number, tile: TileJson) {
        let pos = tile.pos

        const c = TILE_COORDS[tile.icon as MapIcon]
        if (c) {
            ctx.drawImage(map_sprites,
                c[0], c[1], c[2], c[3],
                pos.x * size, pos.y * size, size, size,
            )
        }
    }
    get player() {
        return this.state?.players.find(x => x.id == this.state?.player_id)
    }
    get team() {
        return this.player?.is_hiding ? 'hider' : 'chaser'
    }
    currentPlayerPos(player: PlayerJson) {

    }
    drawPlayer(ctx: CanvasRenderingContext2D, size: number, player: PlayerJson) {
        let pos = player.pos

        let percent = 0
        let dir: Direction = player?.dir ?? 'down'
        if (player?.move) {
            const dt = this.time() - player.move.time
            // console.log('dt', dt)
            percent = Math.min(player.move.next == player.dir ? 10 : 1, (dt) / MOVE_MS)
            // console.log(percent)
            pos = clone(pos)
            // console.log(Date.now(), player.move.time, percent)
            pos.x += (player.move.end.x - pos.x) * percent
            pos.y += (player.move.end.y - pos.y) * percent
        }

        const draw_name = (pos: Pos) => {
            ctx.fillStyle = '30px #fff'
            ctx.font = size * .4 + "px monospace";
            ctx.textAlign = 'center'
            ctx.fillText(player.name ?? player.id.toFixed(5), (pos.x + .5) * size, (pos.y + 1.3) * size)
        }
        if (player.is_hiding) {
            if (!player.is_dead) {
                this.drawTile(ctx, size, {
                    pos, icon: player.is_hiding
                })
                if (this.team == 'hider' || player.move?.time) {
                    draw_name(pos)
                }
            }
        } else {
            // if (!this._) {
            //     this._ = true
            //     ctx.clearRect(0, 0, this.game_canvas.width, this.game_canvas.height)
            // }

            const t = player_sprites[player.skin].coords
            const c = t[dir][Math.floor(Math.max(percent, 0) * t[dir].length) % t[dir].length]
            ctx.drawImage(player_sprites[player.skin].image,
                c[0], c[1], c[2], c[3],
                ((pos.x - .5) * size), ((pos.y - 1) * size), size * 2, size * 2,
            )
            draw_name(pos)

            // ctx.drawImage(player_sprites[player.skin].image,
            //     c[0], c[1], c[2], c[3],
            //     pos.x * size, pos.y * size, size, size,
            // )
        }
    }
}


const TILE_COORDS: Record<MapIcon, [number, number, number, number]> = {
    'grass': [0, 0, 30, 30],
    'flower': [257, 257, 30, 30],
    'bush': [34, 226, 30, 30],
}

const map_sprites = new Image
map_sprites.src = 'mockup-2X.png'

const gen_sprite = (file: string): { image: HTMLImageElement, coords: Record<Direction, [number, number, number, number][]> } => {
    const i = new Image
    i.src = file
    return {
        image: i,
        coords: {
            up: [
                [64 * 0, 64 * 3, 64, 64],
                [64 * 1, 64 * 3, 64, 64],
                [64 * 2, 64 * 3, 64, 64],
                [64 * 3, 64 * 3, 64, 64],
            ],
            down: [
                [64 * 0, 64 * 0, 64, 64],
                [64 * 1, 64 * 0, 64, 64],
                [64 * 2, 64 * 0, 64, 64],
                [64 * 3, 64 * 0, 64, 64],
            ],
            left: [
                [64 * 0, 64 * 1, 64, 64],
                [64 * 1, 64 * 1, 64, 64],
                [64 * 2, 64 * 1, 64, 64],
                [64 * 3, 64 * 1, 64, 64],
            ],
            right: [
                [64 * 0, 64 * 2, 64, 64],
                [64 * 1, 64 * 2, 64, 64],
                [64 * 2, 64 * 2, 64, 64],
                [64 * 3, 64 * 2, 64, 64],
            ],
        },
    }
}

const player_sprites: Record<PlayerIcon, { image: HTMLImageElement, coords: Record<Direction, [number, number, number, number][]> }> = {
    '1': gen_sprite('pl1.png'),
    '2': gen_sprite('pl2.png'),
    '3': gen_sprite('pl3.png'),
    '4': gen_sprite('pl4.png'),
    '5': gen_sprite('pl5.png'),
    '6': gen_sprite('pl6.png'),
    '7': gen_sprite('pl7.png'),
    '8': gen_sprite('pl8.png'),
}