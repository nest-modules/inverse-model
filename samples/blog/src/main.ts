import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InverseModelModule } from '@nestjs-modules/inverse-model';

@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
