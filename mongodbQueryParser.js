'use strict';

const { ObjectId } = require('mongodb');

const MONGODB_OPERATORS = {
    gt: '$gt',      // Greater Than
    gte: '$gte',    // Greater Than or Equal To
    lt: '$lt',      // Less Than
    lte: '$lte',    // Less Than or Equal To
    ne: '$ne',      // Not Equal
    eq: '$eq',      // Equal
    not: '$not',    // Not
    regexp: '$regex',  // Regular Expression
    and: '$and',    // Logical AND
    or: '$or',      // Logical OR
    nor: '$nor',    // Logical NOR
    in: '$in',      // Inclusion
    notIn: '$nin',  // Not In
    expr: '$expr',  // Expression
    match: '$match'  // Text Search Match
};  

const parseQueryToJSON = (query) => {
    const queryJSONString = decodeURIComponent(query);
    return JSON.parse(queryJSONString);
};

const replaceKeyWithMongoDBOperator = (json, key, operator) => {
    const value = json[key];
    delete json[key];
    json[operator] = value;
};

const recursiveKeyReplacement = (json) => {
    Object.keys(json).forEach((key) => {
        if (key === '_id') {
            Object.keys(json[key]).forEach((idKey) => {
                if (Array.isArray(json[key][idKey])) {
                    const objectIds = json[key][idKey].map((id) => new ObjectId(id));
                    json[key][idKey] = objectIds;
                } else {
                    json[key][idKey] = new ObjectId(json[key][idKey]);
                }
            });
        }

        const operator = MONGODB_OPERATORS[key];

        if (json[key] !== null && typeof json[key] === 'object') {
            if (operator) {
                replaceKeyWithMongoDBOperator(json, key, operator);
                recursiveKeyReplacement(json[operator]);
            } else {
                recursiveKeyReplacement(json[key]);
            }
        } else if (operator) {
            replaceKeyWithMongoDBOperator(json, key, operator);
        }
    });
};

const formatLookupQuery = (query) => {
    const as = query?.as || `${query?.model?.charAt(0).toLowerCase() + query?.model?.slice(1)}s`;

    return {
        $lookup: {
            from: `${query?.model?.toLowerCase()}s`,
            localField: query?.localField,
            foreignField: query?.foreignField,
            as,
        },
    }
}

const extractQueriesFromJSON = (json) => {
    const queries = [];

    Object.keys(json)?.forEach((key) => {
        const value = json[key];

        if (value && typeof value === 'object') {
            if (key === 'include') {
                const lookupQuery = formatLookupQuery(value);
                queries.push(lookupQuery);

                if (value?.where) {
                    const matchQuery = { $match: value.where };
                    queries.push(matchQuery);
                }

                if (value?.attributes) {
                    const projectQuery = { $project: value.attributes };
                    queries.push(projectQuery);
                }

                if (value?.offset) {
                    const skipQuery = { $skip: +value.offset };
                    queries.push(skipQuery);
                }

                if (value?.limit) {
                    const limitQuery = { $limit: +value.limit };
                    queries.push(limitQuery);
                }
            } else {
                queries.push(...extractQueriesFromJSON(value));
            }
        }
    });

    return queries;
};

const parseQuery = (req) => {
    return new Promise((resolve, reject) => {
        console.debug('🚀 ~ Request Query: ', req?.query);

        const parsedQuery = [];

        try {
            const queryHandlers = {
                include: (value) => {
                    const jsonQuery = parseQueryToJSON(value);
                    recursiveKeyReplacement(jsonQuery);
                    const includeQueries = extractQueriesFromJSON({ include: jsonQuery });
                    parsedQuery.push(...includeQueries);
                },
                query: (value) => {
                    const query = parseQueryToJSON(value);
                    recursiveKeyReplacement(query);
                    return { $match: query };
                },
                attributes: (value) => {
                    const attributes = parseQueryToJSON(value);
                    if (Object.keys(attributes).length === 0) return null;
                    recursiveKeyReplacement(attributes);
                    return { $project: attributes };
                },
                limit: (value) => {
                    return { $limit: parseInt(value) };
                },
                offset: (value) => {
                    return { $offset: parseInt(value) };
                },
                sort: (value) => {
                    const sort = parseQueryToJSON(value);
                    recursiveKeyReplacement(sort);
                    return { $sort: sort };
                }
            };

            for (const key in req?.query) {
                if (queryHandlers[key]) {
                    const query = queryHandlers[key](req?.query[key]);

                    if (query) {
                        parsedQuery.push(query);   
                    }
                }
            }

            if (parsedQuery.length === 0) {
                parsedQuery.push({
                    $match: {}
                });
            }

            console.debug('🚀 ~ Final mongoose query:', parsedQuery);
            resolve(parsedQuery);
        } catch (error) {
            console.error('🚀 ~ Error mongoose query parser: ', error?.message);
            reject([
                {
                    msg: error.message
                }
            ]);
        }
    });
}

module.exports = { parseQuery };
