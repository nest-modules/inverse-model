import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InverseModelModule } from '@nestjs-modules/inverse-model';

const { DATABASE_URL, REDIS_URL } = process.env;

@Module({
  imports: [
    InverseModelModule.forRoot({
      url: DATABASE_URL!,
      cache: REDIS_URL ? { url: REDIS_URL, ttl: 30 } : undefined,
    }),
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
