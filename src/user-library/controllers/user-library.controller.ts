import { Body, Controller, Delete, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { AccessTokenGuard } from '../../auth/guards/access-token.guard'
import { AuthenticatedRequest } from '../../auth/interfaces/auth.interface'
import { ApiAuthResponse } from '../../auth/decorators/api-auth-response.decorator'
import {
  FavoriteStatusResponseDto,
  LibraryListQueryDto,
  LibraryMovieIdsResponseDto,
  MovieIdDto,
  WatchedResponseDto,
} from '../dto/user-library.dto'
import { UserLibraryService } from '../services/user-library.service'

@ApiTags('User Library')
@ApiBearerAuth('accessToken')
@Controller('users/me/library')
@UseGuards(AccessTokenGuard)
export class UserLibraryController {
  constructor(private readonly library: UserLibraryService) {}

  @Get('favorites')
  @ApiOperation({ summary: 'List the current user’s favorite external movie IDs' })
  @ApiAuthResponse(200, LibraryMovieIdsResponseDto, 'Favorite movie IDs, in the order they were added')
  listFavorites(@Req() request: AuthenticatedRequest, @Query() query: LibraryListQueryDto) {
    return this.library.listFavoriteMovieIds(request.user.id, query.page, query.pageSize)
  }

  @Post('favorites')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add an external movie ID to favorites' })
  @ApiAuthResponse(200, FavoriteStatusResponseDto, 'Favorite state is set to true')
  addFavorite(@Req() request: AuthenticatedRequest, @Body() input: MovieIdDto) {
    return this.library.addFavoriteMovieId(request.user.id, input.movieId)
  }

  @Delete('favorites')
  @HttpCode(200)
  @ApiQuery({ name: 'movieId', required: true, example: '5d3ad84b2c465aa17fbb94de4f166985' })
  @ApiOperation({ summary: 'Remove an external movie ID from favorites' })
  @ApiAuthResponse(200, FavoriteStatusResponseDto, 'Favorite state is set to false')
  removeFavorite(@Req() request: AuthenticatedRequest, @Query() input: MovieIdDto) {
    return this.library.removeFavoriteMovieId(request.user.id, input.movieId)
  }

  @Get('watched')
  @ApiOperation({ summary: 'List watched external movie IDs from the last six calendar months' })
  @ApiAuthResponse(200, LibraryMovieIdsResponseDto, 'Watched IDs, most recently played first')
  listWatched(@Req() request: AuthenticatedRequest, @Query() query: LibraryListQueryDto) {
    return this.library.listWatchedMovieIds(request.user.id, query.page, query.pageSize)
  }

  @Post('watched')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record that playback started for an external movie ID' })
  @ApiAuthResponse(200, WatchedResponseDto, 'Playback timestamp and six-month expiry')
  recordPlaybackStart(@Req() request: AuthenticatedRequest, @Body() input: MovieIdDto) {
    return this.library.recordPlaybackStart(request.user.id, input.movieId)
  }
}
