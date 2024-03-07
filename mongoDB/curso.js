user7 =
{
    'username': 'use7',
    'age': 17,
    'email': 'email7@gmail.com'
}
db.users.insertOne(user7);


db.users.insertMany([
    {
        'username': 'ussda',
        'age': 138,
        'email': 'emailf8@gmail.com',
        'status':'actives'
    },
    {
        'username': 'user9312',
        'age': 194,
        'email': 'emaile9@gmail.com',
        'status':'actives'
    },
    {
        'username': 'user4623',
        'age': 101,
        'email': 'email1qw0@gmail.com',
        'status':'actives'
    }
])

user8 =
{
    'username': 'use8',
    'age': 18,
    'email': 'email8@gmail.com'
};
db.users.findOneAndReplace(user8);


db.users.insertMany([
    {
        'username': 'user9',
        'age': 18,
        'email': 'email8@gmail.com',
        'status': 'active',
    },
    {
        'username': 'user10',
        'age': 19,
        'email': 'email9@gmail.com',
        'status': 'active',
    },
])