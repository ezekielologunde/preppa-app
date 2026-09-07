-- Cross-kitchen build-your-own box: a new subscription kind.
alter type subscription_kind add value if not exists 'box';
