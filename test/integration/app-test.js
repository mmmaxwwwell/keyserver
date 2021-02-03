'use strict';

const request = require('supertest');
const Mongo = require('../../src/dao/mongo');
const nodemailer = require('nodemailer');
const templates = require('../../src/email/templates');
const config = require('config');
const fs = require('fs');
const log = console;

describe('Koa App (HTTP Server) Integration Tests', function() {
  this.timeout(20000);

  const sandbox = sinon.createSandbox();
  let app;
  let mongo;
  let sendEmailStub;
  let publicKeyArmored;
  let emailParams;

  const DB_TYPE_PUB_KEY = 'publickey';
  const DB_TYPE_USER_ID = 'userid';
  const primaryEmail = 'safewithme.testuser@gmail.com';
  const fingerprint = '4277257930867231CE393FB8DBC0B3D92B1B86E9';

  before(async () => {
    sandbox.stub(log);

    publicKeyArmored = fs.readFileSync(`${__dirname}/../fixtures/key1.asc`, 'utf8');
    mongo = new Mongo();
    await mongo.init(config.mongo);

    const paramMatcher = sinon.match(params => {
      emailParams = params;
      return Boolean(params.nonce);
    });
    const ctxMatcher = sinon.match(ctx => Boolean(ctx));
    sandbox.spy(templates, 'verifyKey').withArgs(ctxMatcher, paramMatcher);
    sandbox.spy(templates, 'verifyRemove').withArgs(ctxMatcher, paramMatcher);

    sendEmailStub = sandbox.stub().returns(Promise.resolve({response: '250'}));
    sendEmailStub.withArgs(sinon.match(sendOptions => sendOptions.to.address === primaryEmail));
    sandbox.stub(nodemailer, 'createTransport').returns({
      sendMail: sendEmailStub
    });

    const init = require('../../src/app');
    app = await init();
  });

  beforeEach(async () => {
    await mongo.clear(DB_TYPE_PUB_KEY);
    await mongo.clear(DB_TYPE_USER_ID);
    emailParams = null;
  });

  after(async () => {
    sandbox.restore();
    await mongo.clear(DB_TYPE_PUB_KEY);
    await mongo.clear(DB_TYPE_USER_ID);
    await mongo.disconnect();
  });

  describe('REST api', () => {
    describe('POST /api/v1/key', () => {
      it('should return 400 for an invalid pgp key', done => {
        request(app.listen())
        .post('/api/v1/key')
        .send({publicKeyArmored: 'foo'})
        .expect(400)
        .end(done);
      });

      it('should return 201', done => {
        request(app.listen())
        .post('/api/v1/key')
        .send({publicKeyArmored})
        .expect(201)
        .end(() => {
          expect(emailParams).to.exist;
          done();
        });
      });
    });

    describe('GET /api/v1/key?op=verify', () => {
      beforeEach(done => {
        request(app.listen())
        .post('/api/v1/key')
        .send({publicKeyArmored})
        .expect(201)
        .end(done);
      });

      it('should return 200 for valid params', done => {
        request(app.listen())
        .get(`/api/v1/key?op=verify&keyId=${emailParams.keyId}&nonce=${emailParams.nonce}`)
        .expect(200)
        .end(done);
      });

      it('should return 400 for missing keyid and', done => {
        request(app.listen())
        .get(`/api/v1/key?op=verify&nonce=${emailParams.nonce}`)
        .expect(400)
        .end(done);
      });

      it('should return 400 for missing nonce', done => {
        request(app.listen())
        .get(`/api/v1/key?op=verify&keyId=${emailParams.keyId}`)
        .expect(400)
        .end(done);
      });
    });

    describe('GET /api/key', () => {
      beforeEach(done => {
        request(app.listen())
        .post('/api/v1/key')
        .send({publicKeyArmored})
        .expect(201)
        .end(done);
      });

      describe('Not yet verified', () => {
        it('should return 404', done => {
          request(app.listen())
          .get(`/api/v1/key?keyId=${emailParams.keyId}`)
          .expect(404).end(done);
        });
      });

      describe('Verified', () => {
        beforeEach(done => {
          request(app.listen())
          .get(`/api/v1/key?op=verify&keyId=${emailParams.keyId}&nonce=${emailParams.nonce}`)
          .expect(200)
          .end(done);
        });

        it('should return 200 and get key by id', done => {
          request(app.listen())
          .get(`/api/v1/key?keyId=${emailParams.keyId}`)
          .expect(200)
          .end(done);
        });

        it('should return 200 and get key email address', done => {
          request(app.listen())
          .get(`/api/v1/key?email=${primaryEmail}`)
          .expect(200)
          .end(done);
        });

        it('should return 400 for missing params', done => {
          request(app.listen())
          .get('/api/v1/key')
          .expect(400)
          .end(done);
        });

        it('should return 400 for short key id', done => {
          request(app.listen())
          .get('/api/v1/key?keyId=0123456789ABCDE')
          .expect(400)
          .end(done);
        });

        it('should return 404 for wrong key id', done => {
          request(app.listen())
          .get('/api/v1/key?keyId=0123456789ABCDEF')
          .expect(404)
          .end(done);
        });
      });
    });

    describe('DELETE /api/v1/key', () => {
      beforeEach(done => {
        request(app.listen())
        .post('/api/v1/key')
        .send({publicKeyArmored})
        .expect(201)
        .end(done);
      });

      it('should return 202 for key id', done => {
        request(app.listen())
        .del(`/api/v1/key?keyId=${emailParams.keyId}`)
        .expect(202)
        .end(done);
      });

      it('should return 202 for email address', done => {
        request(app.listen())
        .del(`/api/v1/key?email=${primaryEmail}`)
        .expect(202)
        .end(done);
      });

      it('should return 400 for invalid params', done => {
        request(app.listen())
        .del('/api/v1/key')
        .expect(400)
        .end(done);
      });

      it('should return 404 for unknown email address', done => {
        request(app.listen())
        .del('/api/v1/key?email=a@foo.com')
        .expect(404)
        .end(done);
      });
    });

    describe('GET /api/v1/key?op=verifyRemove', () => {
      beforeEach(done => {
        request(app.listen())
        .post('/api/v1/key')
        .send({publicKeyArmored})
        .expect(201)
        .end(() => {
          request(app.listen())
          .del(`/api/v1/key?keyId=${emailParams.keyId}`)
          .expect(202)
          .end(done);
        });
      });

      it('should return 200 for key id', done => {
        request(app.listen())
        .get(`/api/v1/key?op=verifyRemove&keyId=${emailParams.keyId}&nonce=${emailParams.nonce}`)
        .expect(200)
        .end(done);
      });

      it('should return 400 for invalid params', done => {
        request(app.listen())
        .get('/api/v1/key?op=verifyRemove')
        .expect(400)
        .end(done);
      });

      it('should return 404 for unknown key id', done => {
        request(app.listen())
        .get(`/api/v1/key?op=verifyRemove&keyId=0123456789ABCDEF&nonce=${emailParams.nonce}`)
        .expect(404)
        .end(done);
      });
    });
  });

  describe('HKP api', () => {
    describe('POST /pks/add', () => {
      it('should return 400 for an invalid body', done => {
        request(app.listen())
        .post('/pks/add')
        .type('form')
        .send('keytext=asdf')
        .expect(400)
        .end(done);
      });

      it('should return 201 for a valid PGP key', done => {
        request(app.listen())
        .post('/pks/add')
        .type('form')
        .send(`keytext=${encodeURIComponent(publicKeyArmored)}`)
        .expect(201)
        .end(done);
      });
    });

    describe('GET /pks/lookup', () => {
      beforeEach(done => {
        request(app.listen())
        .post('/pks/add')
        .type('form')
        .send(`keytext=${encodeURIComponent(publicKeyArmored)}`)
        .expect(201)
        .end(done);
      });

      describe('Not yet verified', () => {
        it('should return 404', done => {
          request(app.listen())
          .get(`/pks/lookup?op=get&search=0x${emailParams.keyId}`)
          .expect(404)
          .end(done);
        });
      });

      describe('Verified', () => {
        beforeEach(done => {
          request(app.listen())
          .get(`/api/v1/key?op=verify&keyId=${emailParams.keyId}&nonce=${emailParams.nonce}`)
          .expect(200)
          .end(done);
        });

        it('should return 200 for key id', done => {
          request(app.listen())
          .get(`/pks/lookup?op=get&search=0x${emailParams.keyId}`)
          .expect(200)
          .end(done);
        });

        it('should return 200 for fingerprint', done => {
          request(app.listen())
          .get(`/pks/lookup?op=get&search=0x${fingerprint}`)
          .expect(200)
          .end(done);
        });

        it('should return 200 for correct email address', done => {
          request(app.listen())
          .get(`/pks/lookup?op=get&search=${primaryEmail}`)
          .expect(200)
          .end(done);
        });

        it('should return 200 for "mr" option', done => {
          request(app.listen())
          .get(`/pks/lookup?op=get&options=mr&search=${primaryEmail}`)
          .expect('Content-Type', 'application/pgp-keys; charset=utf-8')
          .expect('Content-Disposition', 'attachment; filename=openpgpkey.asc')
          .expect(200)
          .end(done);
        });

        it('should return 200 for "vindex" op', done => {
          request(app.listen())
          .get(`/pks/lookup?op=vindex&search=0x${emailParams.keyId}`)
          .expect(200)
          .end(done);
        });

        it('should return 200 for "index" with "mr" option', done => {
          request(app.listen())
          .get(`/pks/lookup?op=index&options=mr&search=0x${emailParams.keyId}`)
          .expect('Content-Type', 'text/plain; charset=utf-8')
          .expect(200)
          .end(done);
        });

        it('should return 501 for invalid email', done => {
          request(app.listen())
          .get('/pks/lookup?op=get&search=a@bco')
          .expect(501)
          .end(done);
        });

        it('should return 404 for unkown email', done => {
          request(app.listen())
          .get('/pks/lookup?op=get&search=a@b.co')
          .expect(404)
          .end(done);
        });

        it('should return 501 for missing params', done => {
          request(app.listen())
          .get('/pks/lookup?op=get')
          .expect(501)
          .end(done);
        });

        it('should return 501 for a invalid key id format', done => {
          request(app.listen())
          .get(`/pks/lookup?op=get&search=${emailParams.keyId}`)
          .expect(501)
          .end(done);
        });

        it('should return 404 for unkown key id', done => {
          request(app.listen())
          .get('/pks/lookup?op=get&search=0xDBC0B3D92A1B86E9')
          .expect(404)
          .end(done);
        });

        it('should return 501 (Not implemented) for short key id', done => {
          request(app.listen())
          .get('/pks/lookup?op=get&search=0x2A1B86E9')
          .expect(501)
          .end(done);
        });

        it('should return 501 (Not implemented) for "x-email" op', done => {
          request(app.listen())
          .get(`/pks/lookup?op=x-email&search=0x${emailParams.keyId}`)
          .expect(501)
          .end(done);
        });
      });
    });
  });
});
