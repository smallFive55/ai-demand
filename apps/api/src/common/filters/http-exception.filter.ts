import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Response } from 'express'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<{ headers?: Record<string, string | undefined> }>()
    const requestId = request.headers?.['x-request-id'] ?? randomUUID()

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null
    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? String(exceptionResponse.message)
        : exception instanceof HttpException
          ? exception.message
          : 'Internal server error'

    response.status(status).json({
      success: false,
      error: {
        code: exception instanceof HttpException ? exception.name : 'InternalServerError',
        message,
      },
      meta: {
        occurredAt: new Date().toISOString(),
        requestId,
      },
    })
  }
}
