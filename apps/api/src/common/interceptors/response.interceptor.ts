import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface ApiResponse<T> {
  success: boolean
  data: T
  meta: {
    occurredAt: string
    requestId: string
  }
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>()
    const requestId = request.headers?.['x-request-id'] ?? randomUUID()
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        meta: {
          occurredAt: new Date().toISOString(),
          requestId,
        },
      })),
    )
  }
}
