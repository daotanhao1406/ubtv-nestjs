import { Controller, Get, Post, Body, Query, UseInterceptors, ValidationPipe } from '@nestjs/common' // ... import khác
import { EpisodesService } from './episodes.service'
import { CreateEpisodeDto } from './dto/create-episode.dto'
import { FilterEpisodeDto } from './dto/filter-epidose.dto'

@Controller('episodes')
export class EpisodesController {
  constructor(private readonly episodesService: EpisodesService) {}

  @Post()
  create(@Body() createEpisodeDto: CreateEpisodeDto) {
    return this.episodesService.create(createEpisodeDto)
  }

  @Get()
  findAll(@Query(new ValidationPipe({ transform: true })) filterDto: FilterEpisodeDto) {
    return this.episodesService.findAll(filterDto)
  }
}
