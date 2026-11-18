import { GUARDS_METADATA } from '@nestjs/common/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessTokenGuard } from '../../../auth/guards/access-token.guard'
import { AuthenticatedRequest } from '../../../auth/interfaces/auth.interface'
import { UserLibraryController } from '../../controllers/user-library.controller'
import { UserLibraryService } from '../../services/user-library.service'

describe('UserLibraryController', () => {
  const library = {
    listFavoriteMovieIds: vi.fn(),
    addFavoriteMovieId: vi.fn(),
    removeFavoriteMovieId: vi.fn(),
    listWatchedMovieIds: vi.fn(),
    recordPlaybackStart: vi.fn(),
  }
  const controller = new UserLibraryController(library as unknown as UserLibraryService)
  const request = { user: { id: '507f1f77bcf86cd799439011' } } as AuthenticatedRequest

  beforeEach(() => vi.resetAllMocks())

  it('requires a valid access token for the library controller', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UserLibraryController)).toEqual([AccessTokenGuard])
  })

  it('uses the authenticated user ID when listing watched IDs', async () => {
    const result = { movieIds: ['external-id'], page: 1, pageSize: 50, total: 1, totalPages: 1 }
    library.listWatchedMovieIds.mockResolvedValue(result)

    await expect(controller.listWatched(request, { page: 1, pageSize: 50 })).resolves.toBe(result)
    expect(library.listWatchedMovieIds).toHaveBeenCalledWith(request.user.id, 1, 50)
  })
})
