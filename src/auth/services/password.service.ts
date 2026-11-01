import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.dummyHash = await this.hash(randomBytes(24).toString('hex'))
  }

  async hash(password: string): Promise<string> {
    this.validate(password)
    return bcrypt.hash(password, this.config.getOrThrow<number>('BCRYPT_COST'))
  }

  async verify(password: string, hash?: string): Promise<boolean> {
    this.validate(password)
    const matches = await bcrypt.compare(password, hash ?? this.dummyHash)
    return Boolean(hash) && matches
  }

  private validate(password: string) {
    if (typeof password !== 'string' || [...password].length < 6 || bcrypt.truncates(password)) {
      throw new BadRequestException('password must contain at least 6 characters and at most 72 UTF-8 bytes')
    }
  }
}
