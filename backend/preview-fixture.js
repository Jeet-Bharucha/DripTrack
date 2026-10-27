// Explicit test-only server: in-memory data, no real accounts, providers or email.
const {harness}=require('./test-support');
(async()=>{
  const test=await harness({port:3177,origin:'http://127.0.0.1:3177'});
  const client=test.client();await test.user(client,'preview@example.invalid');
  console.log('Isolated UI test fixture: '+test.root);
  console.log('Test-only sign-in: preview@example.invalid / Test-only-random-password-7428');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
