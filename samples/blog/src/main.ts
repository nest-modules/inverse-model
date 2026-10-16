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
      // A view has no keys of its own; these give it a by-key query and an author.
      views: {
        published_posts: {
          primaryKey: ['id'],
          foreignKeys: [
            { columns: ['author_id'], table: 'authors', references: ['id'] },
          ],
        },
      },
    }),
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
