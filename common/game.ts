
export const TPS = 60
export const MAP_SIZE = 14
export const MOVE_MS = 100
export const GAME_TIMEOUT = 30000
export const NETWORK_DELAY = 0
export const NETWORK_GITTER = 0

export type Direction = 'up' | 'down' | 'left' | 'right'
export type Icon = PlayerIcon | MapIcon
export const PLAYER_ICONS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
export type PlayerIcon = typeof PLAYER_ICONS[number]
export const MAP_ICONS = ['bush', 'grass', 'flower'] as const
export type MapIcon = typeof MAP_ICONS[number]

export type PlayerID = number
export interface PlayerJson {
    id: PlayerID
    name: string
    pos: Pos
    dir: Direction
    move?: {
        time: number,
        end: { x: number, y: number },
        next?: Direction
    }
    is_hiding?: MapIcon
    is_dead: boolean
    skin: PlayerIcon
}
export interface TileJson {
    pos: Pos
    icon: Icon
}
export class MapInstance {
    size: {
        x: number,
        y: number
    }
    tiles: Map<string, TileJson> = new Map

    get(pos: Pos) {
        return this.tiles.get([pos.x, pos.y].join('x'))
    }

    constructor(public json: MapJson) {
        this.size = {
            x: json.tiles.reduce((p, t) => Math.max(t.pos.x, p), 0) + 1,
            y: json.tiles.reduce((p, t) => Math.max(t.pos.y, p), 0) + 1,
        };
        json.tiles.forEach(t => this.tiles.set([t.pos.x, t.pos.y].join('x'), t))
    }

    static generate(opts: { size: number, clutter: number }) {
        let map: MapJson = { tiles: [] }
        for (let x = 0; x < opts.size; x++) {
            for (let y = 0; y < opts.size; y++) {
                map.tiles.push({
                    pos: { x, y, },
                    icon: Math.random() < opts.clutter ? randomPlayerTile() : 'grass',
                })
            }
        }
        return new MapInstance(map)
    }
}
export interface MapJson {
    tiles: TileJson[]
}
export interface GameJson {
    players: PlayerJson[]
    map: MapJson
}

export type MessageFromPlayer = CommonMessage & Partial<{
    SetName: string,
    StartMove: { time: number, dir: Direction },
    StopMove: [],
}>
export type MessageFromServer = CommonMessage & Partial<{
    Init: {
        time: number,
        timeout: number,
        map: MapJson,
        player_id: number,
        players: PlayerJson[],
    }
    Update: {
        time: number,
        players: PlayerJson[],
    },
    GameOver: {
        winners: PlayerID[]
    },
}>
export type CommonMessage = Partial<{
    GetTime: { a: number },
    GetTimeResponse: { a: number, b: number },
}>

export type Pos = { x: number, y: number }

export function randomPlayerTile() {
    const icons = MAP_ICONS.filter(x => x !== 'grass')
    return icons[Math.floor(icons.length * Math.random())]
}