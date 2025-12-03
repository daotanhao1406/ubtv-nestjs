import { Injectable, NotFoundException } from '@nestjs/common'
import { CreateEpisodeDto } from './dto/create-episode.dto'
import { UpdateEpisodeDto } from './dto/update-episode.dto'
import { InjectModel } from '@nestjs/mongoose'
import { Episode } from './entities/episode.entity'
import { Model } from 'mongoose'
import { Movie } from '../movies/entities/movie.entity'
import { FilterEpisodeDto } from './dto/filter-epidose.dto'

@Injectable()
export class EpisodesService {
  constructor(
    @InjectModel(Episode.name) private episodeModel: Model<Episode>,
    @InjectModel(Movie.name) private movieModel: Model<Movie>,
  ) {}

  async create(createEpisodeDto: CreateEpisodeDto) {
    const { movie } = createEpisodeDto

    // 1. Kiểm tra phim có tồn tại không?
    const existingMovie = await this.movieModel.findById(movie)
    if (!existingMovie) {
      throw new NotFoundException(`Can not found film with ID: ${movie}`)
    }

    // 2. Tạo tập phim mới
    const newEpisode = await this.episodeModel.create(createEpisodeDto)
    return newEpisode
  }

  async findAll(filterDto: FilterEpisodeDto) {
    const { page = 1, limit = 10, movieId, chapter, name, startDate, endDate } = filterDto
    const skip = (page - 1) * limit

    // 1. KHỞI TẠO OBJECT FILTER RỖNG
    const filter: any = {}

    // 2. Dựng điều kiện filter (User gửi cái gì thì thêm cái đó)

    // a. Filter chính xác theo ID phim
    if (movieId) {
      filter.movieId = movieId
    }

    // b. Filter chính xác theo số tập
    if (chapter) {
      filter.chapter = chapter
    }

    // c. Tìm kiếm tương đối (LIKE search) theo tên
    // Dùng Regex: 'i' nghĩa là không phân biệt hoa thường (tìm 'tập' ra cả 'Tập')
    if (name) {
      filter.name = { $regex: name, $options: 'i' }
    }

    // d. Filter theo mốc thời gian (Range)
    // createdAt là trường có sẵn của Mongoose (timestamps: true)
    if (startDate || endDate) {
      filter.createdAt = {} // Khởi tạo object cho createdAt

      if (startDate) {
        // $gte: Greater Than or Equal (>=)
        filter.createdAt.$gte = new Date(startDate)
      }

      if (endDate) {
        // $lte: Less Than or Equal (<=)
        filter.createdAt.$lte = new Date(endDate)
      }
    }

    // 3. THỰC THI QUERY
    // Truyền cái biến 'filter' vừa xây dựng vào hàm .find()
    const [data, total] = await Promise.all([
      this.episodeModel
        .find(filter) // 👈 QUAN TRỌNG NHẤT LÀ CHỖ NÀY
        // 👇 THAY ĐỔI Ở ĐÂY
        // Thay vì .populate('movieId') -> Em populate 'movie' (tên trường ảo)
        // Lưu ý: populate trường ảo thì không select field kiểu string 'title year' được
        // mà phải dùng cú pháp object như dưới:
        // .populate({
        //   path: 'movie',
        //   select: 'title releaseYear -_id', // Vẫn select được bình thường ở đây
        // })
        .populate('movie')
        // .select('-movieId') // 👈 Ẩn trường movieId đi
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }) // Mới nhất lên đầu
        .exec(),
      this.episodeModel.countDocuments(filter).exec(), // Đếm cũng phải theo filter nhé
    ])

    return {
      page,
      limit,
      total,
      data,
    }

    // // Sử dụng .populate() để lấy luôn thông tin phim đi kèm
    // const episodes = await this.episodeModel
    //   .find()
    //   .skip(skip)
    //   .limit(limit)
    //   .populate('movieId', 'title releaseYear') // 👈 JOIN: Lấy thông tin phim (chỉ lấy title và năm), nếu cần lấy toàn bộ object movie, xóa tham số thứ 2 'title releaseYear' đi, chỉ cần movieId là đủ
    //   // giả sử muốn lấy full object movie trừ title thì dùng dấu trừ ở trước .populate('movieId', '-title')
    //   .sort({ createdAt: -1 }) // Sắp xếp mới nhất lên đầu
    //   .exec()
    //
    // const total = await this.episodeModel.countDocuments()
    //
    // return {
    //   page,
    //   total,
    //   data: episodes,
    // }
  }

  findOne(id: number) {
    return `This action returns a #${id} episode`
  }

  update(id: number, updateEpisodeDto: UpdateEpisodeDto) {
    return `This action updates a #${id} episode`
  }

  remove(id: number) {
    return `This action removes a #${id} episode`
  }
}
