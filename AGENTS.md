# Hướng dẫn cho AI làm việc trong UBTV NestJS

## Phạm vi và bối cảnh

- Áp dụng cho toàn bộ repository; đọc thêm `AGENTS.md` trong thư mục con trước khi sửa code tại đó.
- Stack hiện tại: NestJS 10, TypeScript, Express, MongoDB/Mongoose, `class-validator`, `class-transformer`, JWT và Vitest.
- Dùng pnpm theo phiên bản trong `package.json`; có thể gọi qua `corepack pnpm`. Giữ nguyên `pnpm-lock.yaml`.
- Đọc `package.json`, cấu hình và module liên quan để xác nhận cách triển khai thực tế. Không mặc định repo dùng Jest, TypeORM hoặc Prisma.
- Chỉ sửa trong phạm vi yêu cầu. Giữ nguyên thay đổi chưa commit của người dùng; không tự refactor toàn bộ repo để áp dụng tài liệu này.

<!-- CODEGRAPH_START -->

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.

<!-- CODEGRAPH_END -->

## Tổ chức thư mục theo tính năng

Giữ các feature trực tiếp dưới `src/` như `auth/`, `users/`, `movies/`, `episodes/`. Không tạo một lớp `modules/` mới hoặc chuyển sang kiến trúc khác khi chưa có yêu cầu.

Mỗi module phải nhóm file theo vai trò trong các thư mục rõ ràng. Đây là quy ước bắt buộc của repository, được chọn để tổ chức code NestJS nhất quán; NestJS không bắt buộc một cấu trúc thư mục duy nhất. Dùng thống nhất tên `services/`, `tests/`, `strategies/`; không trộn với `service/`, `test/`, `strategy/` trong các feature.

Cấu trúc chuẩn cho một feature; chỉ tạo thư mục khi có file thực sự cần dùng:

```text
src/
  main.ts                         # Bootstrap và cấu hình HTTP toàn cục
  app.module.ts                   # Kết nối các module cấp ứng dụng
  config/                         # Cấu hình và kiểm tra biến môi trường
  common/                         # Thành phần kỹ thuật dùng chung giữa các feature
    decorators/
    filters/
    guards/
    interceptors/
    pipes/
  <feature>/
    <feature>.module.ts            # File kết nối module ở gốc feature
    controllers/
      <feature>.controller.ts     # Khi feature cung cấp HTTP API
    services/
      <feature>.service.ts
    dto/
      create-<resource>.dto.ts
      update-<resource>.dto.ts
      query-<resource>.dto.ts
      <resource>-response.dto.ts
    schemas/
      <resource>.schema.ts
    strategies/
      <name>.strategy.ts          # Khi có cơ chế strategy thực sự
    guards/
      <name>.guard.ts
    decorators/
      <name>.decorator.ts
    pipes/
      <name>.pipe.ts
    interceptors/
      <name>.interceptor.ts
    filters/
      <name>.filter.ts
    repositories/
      <resource>.repository.ts    # Khi cần tách tầng truy cập dữ liệu
    interfaces/
      <name>.interface.ts
    types/
      <name>.type.ts
    enums/
      <name>.enum.ts
    constants/
      <name>.constants.ts
    utils/
      <name>.util.ts
    tests/
      controllers/
        <feature>.controller.spec.ts
      services/
        <feature>.service.spec.ts
      dto/
        create-<resource>.dto.spec.ts
      guards/
        <name>.guard.spec.ts
      strategies/
        <name>.strategy.spec.ts
```

- Gốc feature chỉ chứa `<feature>.module.ts` và các thư mục theo vai trò. Không đặt controller, service, DTO, schema, constants, types hoặc test rải rác ở gốc feature.
- Các service phụ trợ cũng đặt trong `services/`, ví dụ `auth/services/password.service.ts`, `auth/services/auth-cookies.service.ts`.
- DTO dùng chung trong feature đặt trong `dto/`; khi nhiều nhóm thao tác, có thể chia tiếp `dto/requests/` và `dto/responses/`. Không thêm tầng thư mục nếu chưa cần.
- Strategy chỉ triển khai cơ chế xác thực hoặc thuật toán tương ứng; guard quyết định quyền truy cập, service xử lý nghiệp vụ. Không thêm Passport hoặc chuyển auth hiện tại sang strategy chỉ để lấp đầy thư mục.
- `interfaces/` chứa interface chia sẻ, `types/` chứa type alias, `enums/` chứa enum, `constants/` chứa hằng và DI token, `utils/` chứa hàm thuần. Kiểu/hằng chỉ dùng cục bộ có thể giữ trong file sở hữu; không dùng các thư mục này để chứa nghiệp vụ đáng lẽ thuộc service.
- Code nghiệp vụ thuộc feature sở hữu nghiệp vụ đó. Chỉ đưa vào `common/` khi nhiều feature thực sự cần và code không phụ thuộc một feature cụ thể.
- Schema Mongoose đặt trong `schemas/`; không tạo schema mới trong `entities/`. Chỉ dùng `entities/` cho domain entity riêng nếu kiến trúc thực sự có nhu cầu đó.
- Test của feature đặt trong `tests/`, chia thư mục con tương ứng với code được kiểm thử và dùng hậu tố `.spec.ts`; không đặt test cạnh file production. Cấu hình Vitest hiện tại `src/**/*.spec.ts` nhận được cấu trúc này.
- Không tạo controller cho module chỉ cung cấp service nội bộ. Không tạo thư mục rỗng hoặc file placeholder để đủ cây mẫu.
- Với feature mới, áp dụng cấu trúc này ngay. Khi tác vụ yêu cầu tổ chức lại feature hiện có, di chuyển file và cập nhật toàn bộ import, module metadata, đường dẫn test và tài liệu liên quan; giữ nguyên contract và hành vi API. Việc sửa logic cục bộ không yêu cầu tự di chuyển toàn bộ feature ngoài phạm vi tác vụ.
- Không tạo sẵn repository, base service, generic CRUD, CQRS hoặc các tầng domain/application/infrastructure cho một tác vụ đơn giản. Chỉ tách thêm tầng khi có nhu cầu rõ ràng.

## Trách nhiệm và dependency injection

- **Module** khai báo `imports`, `controllers`, `providers`, `exports`. Chỉ export provider là giao diện cần dùng bên ngoài module.
- **Controller** xử lý route, nhận DTO/params, đặt HTTP status/header/cookie và gọi service. Không truy vấn Mongoose hoặc chứa quy tắc nghiệp vụ trong controller.
- **Service** xử lý nghiệp vụ và điều phối dependency. Không phụ thuộc trực tiếp `Request`/`Response` của Express; nhận dữ liệu cần thiết qua tham số có kiểu rõ ràng.
- **Schema** mô tả lưu trữ, index và ràng buộc dữ liệu. **DTO** mô tả dữ liệu vào/ra của API; không dùng schema/document thay thế request DTO.
- **Guard** xử lý quyền truy cập; **pipe** chuyển đổi/kiểm tra đầu vào; **interceptor** xử lý trước/sau handler; **filter** chuyển đổi exception khi thực sự cần.
- Dùng constructor injection, ưu tiên `private readonly`, và `@Injectable()` cho provider do Nest quản lý. Không tự `new` service có dependency trong code chạy ứng dụng.
- Khi cần service từ feature khác, import module sở hữu và dùng provider được export. Không khai báo lại service đó trong `providers` của module tiêu thụ.
- Không truy cập model nội bộ của feature khác trực tiếp. Gọi service được export để giữ ranh giới module.
- Tránh dependency vòng. Nếu xuất hiện, xem lại trách nhiệm hoặc tách phần dùng chung; không mặc định dùng `forwardRef()` hay `@Global()` để che vấn đề.
- `main.ts` dành cho bootstrap; `AppModule` dành cho kết nối module. Đặt cấu hình toàn cục có dependency trong DI container qua các cơ chế `APP_*` khi phù hợp.

## Quy ước TypeScript và đặt tên

- File/thư mục dùng `kebab-case`; class dùng `PascalCase`; biến/hàm dùng `camelCase`; hằng thực sự dùng `UPPER_SNAKE_CASE`.
- Dùng hậu tố đúng vai trò: `MoviesModule`, `MoviesController`, `MoviesService`, `CreateMovieDto`, `MovieSchema`, `AccessTokenGuard`.
- Theo `.prettierrc` và ESLint hiện có: 2 dấu cách, nháy đơn, không dấu chấm phẩy, độ rộng 120 ký tự. Tránh format lại file không liên quan.
- Ưu tiên kiểu cụ thể, kiểu trả về rõ ràng ở ranh giới module và `unknown` cho dữ liệu chưa biết kiểu. Tránh `any`, ép kiểu kép hoặc `!` để bỏ qua lỗi khi có thể kiểm tra dữ liệu.
- Request DTO dùng class có decorator validation. DTO và class dùng làm DI token cần import ở runtime; không dùng `import type` cho các trường hợp cần decorator metadata.
- Giữ cấu hình CommonJS và decorator metadata hiện tại. Không đổi compiler options hoặc bật strict cho toàn repo ngoài phạm vi tác vụ.
- Giữ cách import nhất quán với file/module đang sửa; không tự thêm alias hay barrel `index.ts` gây dependency vòng.
- Comment giải thích lý do hoặc ràng buộc khó thấy; không kể lại từng dòng code.

## HTTP API, validation và lỗi

- Với API mới, dùng route theo tài nguyên và HTTP method phù hợp; giữ tương thích route và contract hiện có khi sửa API.
- Body/query có cấu trúc phải có DTO với `class-validator`; dùng `class-transformer` để chuyển đổi có chủ đích. Interface TypeScript không thay thế validation ở runtime.
- Giữ `ValidationPipe` toàn cục với `transform`, `whitelist`, `forbidNonWhitelisted` đang bật trong `main.ts`.
- Kiểm tra route params bằng pipe phù hợp, gồm ObjectId trước khi truy vấn MongoDB. Pagination phải là số nguyên dương và có giới hạn `pageSize` rõ ràng.
- Chỉ dùng `PartialType` từ `@nestjs/mapped-types` khi mọi field của DTO gốc đều được phép cập nhật; tách DTO nếu quyền cập nhật khác nhau.
- Không truyền toàn bộ request body/query vào model hoặc MongoDB filter. Chọn rõ các trường được phép, đặc biệt với quyền, chủ sở hữu và thông tin xác thực.
- Dùng exception có sẵn của Nest cho lỗi dự kiến: `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`.
- Không trả `{ error: ... }` với HTTP 200 hoặc bắt mọi lỗi rồi trả kết quả thành công. Không lộ stack trace, thông tin kết nối hay lỗi nội bộ của database.
- Controller trả dữ liệu để `TransformInterceptor` bọc thành `{ statusCode, message, data, timestamp }`; không bọc envelope lần thứ hai. Lỗi tiếp tục theo cơ chế exception của Nest.
- Ưu tiên cơ chế response mặc định của Nest. Khi cần đặt cookie/header bằng Express, dùng `@Res({ passthrough: true })` và vẫn trả dữ liệu qua handler.

## Mongoose, cấu hình và bảo vệ dữ liệu

- Khai báo schema bằng `@Schema()`, `@Prop()`, `SchemaFactory`; đăng ký qua `MongooseModule.forFeature()` trong module sở hữu, inject bằng `@InjectModel()`.
- Giữ kết nối database tập trung trong cấu hình ứng dụng. Không tạo connection mới cho từng service hoặc request.
- Truy vấn đặt trong service hoặc repository riêng khi có lý do. Dùng projection và `.lean()` cho thao tác chỉ đọc khi không cần document methods/hooks/getters.
- Với truy vấn danh sách, có pagination và thứ tự sắp xếp ổn định. Không tải toàn bộ collection để lọc hoặc phân trang trong bộ nhớ.
- Khi cập nhật cần schema validation, dùng `runValidators: true`; chọn rõ trả document trước hay sau cập nhật và xử lý trường hợp không tồn tại.
- Ràng buộc duy nhất phải có unique index; kiểm tra trước bằng query không thay thế index. Chuyển lỗi duplicate key sang lỗi nghiệp vụ phù hợp.
- Với dữ liệu cạnh tranh, ưu tiên cập nhật có điều kiện nguyên tử. Chỉ dùng transaction khi nghiệp vụ cần tính nguyên tử qua nhiều document và môi trường hỗ trợ.
- Dùng `ConfigService` để đọc cấu hình trong provider. Khai báo/kiểm tra biến mới tại `src/config/environment.ts`, cập nhật `.env.example` và README khi cần.
- Không hardcode hoặc ghi log secret, password, token, cookie, chuỗi kết nối. Không sửa/ghi đè `.env.local` của người dùng; ví dụ chỉ chứa giá trị giả.
- Response chỉ chứa trường công khai được chọn rõ ràng; không trả password hash hoặc refresh token trong JSON.
- Giữ các ràng buộc auth hiện có trong README và code: kiểm tra JWT, hash mật khẩu, refresh rotation, cookie, CORS, origin guard và rate limit. Khi thay đổi hành vi phải cập nhật test và tài liệu tương ứng.

## Kiểm thử và kiểm tra trước khi hoàn tất

- Dùng Vitest và `vi`, theo cấu hình `vitest.config.mts`. Unit test hiện tại khởi tạo đối tượng với dependency mock; dùng `@nestjs/testing` khi cần kiểm tra DI và dependency đã có trong repo.
- Test mới của feature phải nằm trong `<feature>/tests/<vai-trò>/`, ví dụ `src/auth/tests/services/auth.service.spec.ts`. Khi di chuyển test cũ, sửa các import tương đối và giữ hậu tố `.spec.ts` để Vitest tiếp tục tìm thấy test.
- Test hành vi quan trọng: đường thành công, dữ liệu sai, không tìm thấy, xung đột và quyền truy cập khi liên quan. Không chỉ kiểm tra implementation được gọi lại đúng như code.
- Mock database và dịch vụ bên ngoài trong unit test; không kết nối database thật hoặc phụ thuộc `.env.local`. Không coi unit test là bằng chứng cho hành vi tích hợp HTTP/database.
- Khi sửa logic, thêm/cập nhật test liên quan. Thay đổi chỉ có tài liệu không cần chạy toàn bộ test/build.
- Các lệnh hiện có chạy từ thư mục gốc:

```powershell
corepack pnpm exec vitest run src/<feature>/tests/services/<feature>.service.spec.ts
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm exec eslint "src/<feature>/**/*.ts"
```

- Chọn kiểm tra phù hợp phạm vi; với thay đổi code, chạy test liên quan, typecheck và build khi có thể. Dùng đường dẫn feature thực tế thay các placeholder.
- `pnpm lint` hiện có `--fix`, `pnpm format` cũng ghi file trên phạm vi rộng. Ưu tiên lint/format những file đã sửa, tránh thay đổi ngoài yêu cầu.
- Không tự thêm dependency hoặc đổi framework test để xử lý việc đơn giản; nếu cần dependency mới, giải thích lý do và cập nhật lockfile bằng pnpm.
- Trước khi kết thúc, xem diff, kiểm tra module/provider đã đăng ký đúng, và báo rõ thay đổi cùng các kiểm tra đã chạy. Nếu không chạy được, nói rõ giới hạn; không khẳng định kiểm tra đã pass.

## Tài liệu tham khảo

Áp dụng API tương thích với NestJS 10 và dependency thực tế của repo khi tra cứu tài liệu:

- [Modules](https://docs.nestjs.com/modules)
- [Providers và dependency injection](https://docs.nestjs.com/providers)
- [Validation và DTO](https://docs.nestjs.com/techniques/validation)
- [MongoDB/Mongoose](https://docs.nestjs.com/techniques/mongodb)
