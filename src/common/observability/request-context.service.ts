import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

type RequestContextStore = {
    requestId: string;
};

@Injectable()
export class RequestContextService {
    private readonly asyncLocalStorage =
        new AsyncLocalStorage<RequestContextStore>();

    run<T>(store: RequestContextStore, callback: () => T): T {
        return this.asyncLocalStorage.run(store, callback);
    }

    getRequestId(): string | undefined {
        return this.asyncLocalStorage.getStore()?.requestId;
    }
}
