import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common'
import { MoviesService } from './movies.service'
import { CreateMovieDto } from './dto/create-movie.dto'
import { UpdateMovieDto } from './dto/update-movie.dto'

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Post()
  create(@Body() createMovieDto: CreateMovieDto) {
    return this.moviesService.create(createMovieDto)
  }

  @Get()
  findAll(@Query() query: { page?: string; pageSize?: string }) {
    const page = query.page ? parseInt(query.page) : 1

    const pageSize = query.pageSize ? parseInt(query.pageSize) : 10

    return this.moviesService.findAll(page, pageSize)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.moviesService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateMovieDto: UpdateMovieDto) {
    return this.moviesService.update(id, updateMovieDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.moviesService.remove(id)
  }
}
