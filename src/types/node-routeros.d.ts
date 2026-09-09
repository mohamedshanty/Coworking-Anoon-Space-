declare module "node-routeros" {
  export class RouterOSAPI {
    constructor(opts: {
      host: string;
      user: string;
      password: string;
      port?: number;
      timeout?: number;
      keepalive?: boolean;
    });
    connected: boolean;
    connect(): Promise<RouterOSAPI>;
    write(cmd: string[]): Promise<any[]>;
    close(): Promise<void>;
    on(event: string, cb: (...args: any[]) => void): void;
  }
}
