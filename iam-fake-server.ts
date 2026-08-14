/**
 * Fake server AWS IAM (Query API) para desarrollo local
 *
 * Implementa las acciones usadas por IamService: CreateUser, CreateAccessKey,
 * DeleteAccessKey, DeleteUser, PutUserPolicy, DeleteUserPolicy.
 * Responde XML siguiendo el formato del protocolo Query de AWS, que es lo que
 * @aws-sdk/client-iam espera parsear.
 */
import express, { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.MOCK_IAM_PORT || '4001');
const DB_FILE = process.env.MOCK_IAM_DB_FILE || path.join(__dirname, 'iam-data.json');

interface IUser {
  userName: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  policies: Record<string, string>;
}

function loadUsers(): Map<string, IUser> {
  if (fs.existsSync(DB_FILE)) {
    try {
      const entries: [string, IUser][] = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      return new Map(entries);
    } catch (err) {
      console.error(`No se pudo leer ${DB_FILE}, se usa estado vacio.`, err);
    }
  }
  return new Map();
}

const users = loadUsers();

function persist(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(Array.from(users.entries()), null, 2));
}

function fakeAccessKeyId(): string {
  return `AKIAFAKE${randomBytes(8).toString('hex').toUpperCase()}`;
}

function fakeSecretKey(): string {
  return randomBytes(30).toString('base64');
}

function requestId(): string {
  return randomBytes(16).toString('hex');
}

function xmlError(res: Response, status: number, code: string, message: string): void {
  res.status(status).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<ErrorResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
  <Error>
    <Type>Sender</Type>
    <Code>${code}</Code>
    <Message>${message}</Message>
  </Error>
  <RequestId>${requestId()}</RequestId>
</ErrorResponse>`);
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: '*/*' }));

app.use((req: Request, _res: Response, next) => {
  if (typeof req.body === 'string') {
    const params = new URLSearchParams(req.body);
    req.body = Object.fromEntries(params.entries());
  }
  next();
});

app.post('/', (req: Request, res: Response) => {
  const { Action, UserName, PolicyName, PolicyDocument, AccessKeyId } = req.body as Record<string, string>;
  const reqId = requestId();

  switch (Action) {
    case 'CreateUser': {
      if (users.has(UserName)) {
        return xmlError(res, 409, 'EntityAlreadyExists', `User with name ${UserName} already exists.`);
      }
      users.set(UserName, { userName: UserName, accessKeyId: null, secretAccessKey: null, policies: {} });
      persist();
      return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<CreateUserResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
  <CreateUserResult>
    <User>
      <UserName>${UserName}</UserName>
      <UserId>${requestId()}</UserId>
      <Arn>arn:aws:iam::000000000000:user/${UserName}</Arn>
      <CreateDate>${new Date().toISOString()}</CreateDate>
    </User>
  </CreateUserResult>
  <ResponseMetadata><RequestId>${reqId}</RequestId></ResponseMetadata>
</CreateUserResponse>`);
    }

    case 'CreateAccessKey': {
      const user = users.get(UserName);
      if (!user) return xmlError(res, 404, 'NoSuchEntity', `User ${UserName} does not exist.`);

      const accessKeyId = fakeAccessKeyId();
      const secretAccessKey = fakeSecretKey();
      user.accessKeyId = accessKeyId;
      user.secretAccessKey = secretAccessKey;
      persist();

      return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<CreateAccessKeyResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
  <CreateAccessKeyResult>
    <AccessKey>
      <UserName>${UserName}</UserName>
      <AccessKeyId>${accessKeyId}</AccessKeyId>
      <Status>Active</Status>
      <SecretAccessKey>${secretAccessKey}</SecretAccessKey>
      <CreateDate>${new Date().toISOString()}</CreateDate>
    </AccessKey>
  </CreateAccessKeyResult>
  <ResponseMetadata><RequestId>${reqId}</RequestId></ResponseMetadata>
</CreateAccessKeyResponse>`);
    }

    case 'DeleteAccessKey': {
      const user = users.get(UserName);
      if (!user) return xmlError(res, 404, 'NoSuchEntity', `User ${UserName} does not exist.`);
      if (!AccessKeyId || user.accessKeyId !== AccessKeyId) {
        return xmlError(res, 404, 'NoSuchEntity', `Access key ${AccessKeyId} does not exist.`);
      }
      user.accessKeyId = null;
      user.secretAccessKey = null;
      persist();

      return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<DeleteAccessKeyResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
  <ResponseMetadata><RequestId>${reqId}</RequestId></ResponseMetadata>
</DeleteAccessKeyResponse>`);
    }

    case 'DeleteUser': {
      if (!users.has(UserName)) return xmlError(res, 404, 'NoSuchEntity', `User ${UserName} does not exist.`);
      users.delete(UserName);
      persist();

      return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<DeleteUserResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
  <ResponseMetadata><RequestId>${reqId}</RequestId></ResponseMetadata>
</DeleteUserResponse>`);
    }

    case 'PutUserPolicy': {
      const user = users.get(UserName);
      if (!user) return xmlError(res, 404, 'NoSuchEntity', `User ${UserName} does not exist.`);
      user.policies[PolicyName] = PolicyDocument;
      persist();

      return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<PutUserPolicyResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
  <ResponseMetadata><RequestId>${reqId}</RequestId></ResponseMetadata>
</PutUserPolicyResponse>`);
    }

    case 'DeleteUserPolicy': {
      const user = users.get(UserName);
      if (!user) return xmlError(res, 404, 'NoSuchEntity', `User ${UserName} does not exist.`);
      if (!(PolicyName in user.policies)) {
        return xmlError(res, 404, 'NoSuchEntity', `Policy ${PolicyName} does not exist for user ${UserName}.`);
      }
      delete user.policies[PolicyName];
      persist();

      return res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<DeleteUserPolicyResponse xmlns="https://iam.amazonaws.com/doc/2010-05-08/">
  <ResponseMetadata><RequestId>${reqId}</RequestId></ResponseMetadata>
</DeleteUserPolicyResponse>`);
    }

    default:
      return xmlError(res, 400, 'InvalidAction', `Action ${Action} is not supported by the fake IAM server.`);
  }
});

app.listen(PORT, () => {
  console.log(`Fake IAM server escuchando en http://localhost:${PORT}`);
});
