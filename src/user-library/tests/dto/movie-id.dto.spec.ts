import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { MovieIdDto } from '../../dto/user-library.dto'

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })

describe('MovieIdDto', () => {
  it('accepts opaque external IDs without ObjectId casting or format assumptions', async () => {
    await expect(
      pipe.transform({ movieId: 'provider/id:42' }, { type: 'body', metatype: MovieIdDto }),
    ).resolves.toMatchObject({
      movieId: 'provider/id:42',
    })
  })

  it('rejects empty and non-string IDs', async () => {
    await expect(pipe.transform({ movieId: '   ' }, { type: 'body', metatype: MovieIdDto })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(pipe.transform({ movieId: 42 }, { type: 'body', metatype: MovieIdDto })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
