import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface Response<T> {
  statusCode: number
  message: string
  data: T
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map(data => ({
        // Bởi vì @HttpCode và TransformInterceptor làm 2 nhiệm vụ hoàn toàn khác nhau, dù chúng liên quan mật thiết.
        //         Hãy tưởng tượng API Response của em như một bức thư gửi bưu điện.
        //
        //           HTTP Header (Do @HttpCode quyết định): Là cái Phong bì.
        //
        //       Trên phong bì có đóng dấu bưu điện: 200 OK (Gửi thành công), 404 (Không tìm thấy địa chỉ), 500 (Xe thư bị cháy).
        //
        //     Trình duyệt (Browser) và Postman sẽ nhìn vào cái này đầu tiên để biết xanh hay đỏ.
        //
        //       Response Body (Do TransformInterceptor quyết định): Là tờ giấy viết thư bên trong.
        //
        //       Trong tờ giấy, em viết lại một lần nữa: "Chào bạn, thư này được gửi thành công nhé (Mã 200)".
        //
        // 👉 Vấn đề: Frontend Developer đôi khi lười check cái "phong bì" (Header). Họ thích cầm cái cục JSON ("lá thư") lên và đọc luôn trạng thái ở trong đó cho tiện xử lý logic hiển thị.

        // Nếu Controller em để @HttpCode(200): Interceptor sẽ đọc được số 200 và điền vào JSON.
        //
        // Nếu Controller em để @HttpCode(201): Interceptor sẽ đọc được số 201 và điền vào JSON.
        //       Kết luận:
        //
        // @HttpCode: Là Người ra lệnh (Set chuẩn cho giao thức HTTP).
        //
        //   Interceptor: Là Thư ký (Copy cái lệnh đó vào trong nội dung báo cáo để người đọc dễ thấy).

        // 👇 Dòng này nghĩa là: "Interceptor ơi, hãy nhìn xem cái Phong bì (Response)
        // đang dán tem số mấy, rồi copy cái số đó bỏ vào trong Lá thư (Body) nhé."
        statusCode: context.switchToHttp().getResponse().statusCode,
        message: 'Success', // Em có thể logic hóa cái message này sau
        data: data, // data chính là cái { page, total, rows } em trả về từ Service
        timestamp: new Date().toISOString(),
      })),
    )
  }
}
