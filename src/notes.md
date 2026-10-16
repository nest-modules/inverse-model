# Captura la URI de la base de datos

## Convencion
motor://usuario:contraseña@servidor:puerto/nombre_base_datos?parametro1=valor&parametro2=valor

### Postgres
postgresql://postgres:password123@localhost:5432/mi_base_datos?sslmode=requireq

### Comandos 
npm run start:dev

### Decoradores
@Get()
@Post()
@Controller()
@Injectable()

### Modules
- creacion de modulos atraves de la CLI nest generate module <nombre> o nest g mo <nombre>
- Un modulo puede contener varios controllers

### Controllers
- creacion de controllers atraves de la CLI nest generate controller <nombre>  o nest g co <nombre>
- Funciones que se van a llamar con una ruta indicada y nos va a realizar algun tarea.
### Services
- Logica o codigo reutilizable 
### DTO