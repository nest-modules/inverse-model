const uri = 'postgresql://postgres:password123@localhost:5432/mi_base_datos?sslmode=require';
const parsedUri = new URL(uri);

console.log(parsedUri.protocol); // 'postgresql:'
console.log(parsedUri.hostname); // 'localhost'
console.log(parsedUri.port);     // '5432'
console.log(parsedUri.username); // 'postgres'
console.log(parsedUri.password); // 'password123'
console.log(parsedUri.pathname); // '/mi_base_datos'