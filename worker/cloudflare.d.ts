// The few Workers runtime types the Worker uses (no @cloudflare/workers-types dependency).
declare module 'cloudflare:workers' {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState
    protected env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }
}
interface DurableObjectState {
  storage: { get<T>(key: string): Promise<T | undefined>; put<T>(key: string, value: T): Promise<void> }
}
interface DurableObjectId {}
// Calls on a stub go to the object over RPC and always come back as promises.
type DurableObjectStub<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never
}
interface DurableObjectNamespace<T> {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub<T>
}
