export class AppError extends Error {
    readonly code: string;
    readonly details?: unknown;
    readonly httpStatus: number;

    constructor(params: {
        code: string;
        message: string;
        httpStatus: number;
        details?: unknown;
    }) {
        super(params.message);
        this.code = params.code;
        this.details = params.details;
        this.httpStatus = params.httpStatus;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
