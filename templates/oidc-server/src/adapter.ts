import type { Adapter, AdapterPayload } from 'oidc-provider'
import { load, save } from './storage.js'

/**
 * Opslag voor de artefacten van oidc-provider: sessies, grants, tokens,
 * interacties. De ingebouwde adapter is bewust alleen voor demo's — vandaar de
 * waarschuwing bij het opstarten.
 *
 * Dit is dezelfde structuur als een echte adapter, maar met een JSON-bestand in
 * plaats van een database. Wil je naar Postgres, dan vervang je alleen de body
 * van deze zeven methodes; de rest van de hub blijft ongewijzigd.
 */
interface Entry {
    payload: AdapterPayload
    expiresAt?: number
}

type Store = Record<string, Record<string, Entry>>

const store: Store = load<Store>('oidc', {})
const grantIndex: Record<string, string[]> = load<Record<string, string[]>>('oidc-grants', {})

function persist(): void {
    save('oidc', store)
    save('oidc-grants', grantIndex)
}

function bucket(name: string): Record<string, Entry> {
    store[name] ??= {}
    return store[name]
}

function alive(entry: Entry | undefined): AdapterPayload | undefined {
    if (!entry) return undefined
    if (entry.expiresAt && entry.expiresAt < Date.now()) return undefined
    return entry.payload
}

export class FileAdapter implements Adapter {
    constructor(private readonly name: string) {}

    private key(id: string): string {
        return id
    }

    async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
        bucket(this.name)[this.key(id)] = {
            payload,
            expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined
        }

        if (payload.grantId) {
            grantIndex[payload.grantId] ??= []
            grantIndex[payload.grantId].push(`${this.name}:${id}`)
        }

        persist()
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        return alive(bucket(this.name)[this.key(id)])
    }

    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
        return Object.values(bucket(this.name))
            .map(alive)
            .find(p => p?.userCode === userCode)
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        return Object.values(bucket(this.name))
            .map(alive)
            .find(p => p?.uid === uid)
    }

    async consume(id: string): Promise<void> {
        const entry = bucket(this.name)[this.key(id)]
        if (entry) {
            entry.payload.consumed = Math.floor(Date.now() / 1000)
            persist()
        }
    }

    async destroy(id: string): Promise<void> {
        delete bucket(this.name)[this.key(id)]
        persist()
    }

    async revokeByGrantId(grantId: string): Promise<void> {
        for (const ref of grantIndex[grantId] ?? []) {
            const [name, id] = ref.split(/:(.*)/s)
            delete bucket(name)[id]
        }
        delete grantIndex[grantId]
        persist()
    }
}
