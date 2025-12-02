import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose' // Import InjectModel
import { Model } from 'mongoose' // Import Model
import { CreateMovieDto } from './dto/create-movie.dto'
import { UpdateMovieDto } from './dto/update-movie.dto'
import { Movie } from './entities/movie.entity'

@Injectable()
export class MoviesService {
  // Constructor: Tiêm Model vào để dùng
  constructor(@InjectModel(Movie.name) private movieModel: Model<Movie>) {}

  // 1. Tạo mới
  async create(createMovieDto: CreateMovieDto): Promise<Movie> {
    const createdMovie = new this.movieModel(createMovieDto)
    return createdMovie.save() // Hàm save() sẽ lưu thẳng vào MongoDB
  }

  // 2. Lấy tất cả
  async findAll(page: number, limit: number) {
    // Bỏ kiểu trả về Promise<Movie[]> đi nhé, vì giờ nó trả về Object
    const skip = (page - 1) * limit

    // 1. Thực hiện 2 việc song song: Lấy data và Đếm tổng
    const [rows, total] = await Promise.all([
      this.movieModel.find().skip(skip).limit(limit).lean().exec(),
      this.movieModel.countDocuments().exec(), // Đếm xem trong kho có bao nhiêu phim
    ])

    // 2. Trả về đúng format em muốn
    return {
      page,
      pageSize: limit,
      total,
      rows, // Đây là mảng chứa các phim
    }
  }

  // 3. Lấy 1 cái theo ID
  async findOne(id: string): Promise<Movie> {
    // Lưu ý: ID của Mongo là chuỗi ký tự dài (ObjectId), không phải số
    const movie = await this.movieModel.findById(id).exec()
    if (!movie) {
      throw new NotFoundException(`Không tìm thấy phim với ID: ${id}`)
    }
    return movie
  }

  // 4. Update
  async update(id: string, updateMovieDto: UpdateMovieDto): Promise<Movie> {
    const updatedMovie = await this.movieModel
      .findByIdAndUpdate(id, updateMovieDto, { new: true }) // new: true để trả về data mới sau khi update
      .exec()

    if (!updatedMovie) {
      throw new NotFoundException(`Không tìm thấy phim để update`)
    }
    return updatedMovie
  }

  // 5. Delete
  async remove(id: string): Promise<any> {
    const deletedMovie = await this.movieModel.findByIdAndDelete(id).exec()
    if (!deletedMovie) {
      throw new NotFoundException(`Không tìm thấy phim để xóa`)
    }
    return deletedMovie
  }
}
