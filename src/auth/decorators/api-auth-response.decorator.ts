import { applyDecorators, Type } from '@nestjs/common'
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger'

export function ApiAuthResponse(status: number, model: Type<unknown>, description: string) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['statusCode', 'message', 'data', 'timestamp'],
        properties: {
          statusCode: { type: 'integer', example: status },
          message: { type: 'string', example: 'Success' },
          data: { $ref: getSchemaPath(model) },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    }),
  )
}
